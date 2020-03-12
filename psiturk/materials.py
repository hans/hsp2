from argparse import ArgumentParser
from collections import defaultdict, Counter
import itertools
import json
import logging
from pathlib import Path
import random
import re
import requests

import spacy
import pandas as pd
from tqdm import tqdm

logging.basicConfig(level=logging.INFO)
L = logging.getLogger(__name__)

# load spacy model
nlp = spacy.load("en")

# load materials
MATERIALS_PATH = Path("/materials")
ITEMS_PATH = MATERIALS_PATH / "items.csv"
NONCE_PATH = MATERIALS_PATH / "nonces.csv"

materials_df = pd.read_csv(ITEMS_PATH, encoding="utf-8",
                           index_col=["item_idx", "scene", "verb"],
                           keep_default_na=False)
nonce_df = pd.read_csv(NONCE_PATH, encoding="utf-8", index_col=["stem"])

# regex for matching function words in sentences specified in materials
function_re = re.compile(r"\[([^\]]+)\]")


def memoize(f):
    """ Memoization decorator for functions taking one or more arguments. """
    class memodict(dict):
        def __init__(self, f):
            self.f = f
        def __call__(self, *args):
            return self[args]
        def __missing__(self, key):
            ret = self[key] = self.f(*key)
            return ret
    return memodict(f)


class Noncer(object):
    """
    Stateful utility for nonce-ing sentences.
    """
    def __init__(self, nonce_df):
        self.nonce_df = nonce_df
        self.nonce_df["form_stem"] = self.nonce_df.index

        self.nonce_map = {}
        self.used_nonces = Counter()
        self._pull_nonces()

    def _pull_nonces(self):
        self.available_nonces = list(self.nonce_df.index)
        random.shuffle(self.available_nonces)

    @classmethod
    def from_nonce_csv(cls, nonce_csv):
        return cls(pd.read_csv(nonce_csv, encoding="utf-8", index_col=0))

    def get_nonce_row(self, word):
        if word in self.nonce_map:
            return self.nonce_df.loc[self.nonce_map[word]]

        if len(self.available_nonces) == 0:
            L.warn("Ran out of unique nonces. Re-using past nonces.")
            self._pull_nonces()

        stem = self.available_nonces.pop()
        self.nonce_map[word] = stem
        self.used_nonces[stem] += 1

        row = self.nonce_df.loc[stem]
        return row

    def nonce(self, word, tag=None):
        row = self.get_nonce_row(word)
        stem = row.name
        if "form_%s" % tag in row.index:
            ret = row["form_%s" % tag]
        else:
            ret = stem

        return ret, stem

    def nonce_sentence(self, sentence, nonce_data, overrides=None):
        if overrides is None:
            overrides = {}

        sentence_tokens = sentence.strip().split(" ")
        sentence_nonces = []
        for idx, tag in nonce_data:
            if idx in overrides:
                sentence_tokens[idx] = overrides[idx]
            else:
                sentence_tokens[idx], used_nonce = self.nonce(sentence_tokens[idx], tag)
                sentence_nonces.append(used_nonce)

        sentence = " ".join(sentence_tokens)
        return sentence, sentence_nonces


@memoize
def parse(sentence):
    with nlp.disable_pipes("ner"):
        return nlp(sentence)


def prepare_sentence_nonces(item_row):
    """
    Given an item row, return a pair `(sentence, nonce_data)`, where `sentence`
    is a joined natural language sentence and `nonce_data` is a tuple `(index,
    pos_tag)`, specifying indices at which to nonce words, and their original
    part of speech.

    Args:
      item_row:
    """
    left, verb_form, right = item_row[["sentence_left", "verb_form", "sentence_right"]]
    left, right = left.strip().split(" "), right.strip().split(" ")
    if left == [""]: left = []
    if right == [""]: right = []

    # Parse sentence and get morphological information.
    sentence = " ".join(left + [verb_form] + right)
    sentence = function_re.sub(r"\1", sentence)
    parsed = parse(sentence)
    sentence_tags = [t.tag_ for t in parsed]

    nonce_idxs = [idx for idx, word in enumerate(left)
                  if not function_re.match(word)]
    nonce_idxs += [idx + len(left) + 1 for idx, word in enumerate(right)
                   if not function_re.match(word)]
    nonce_data = [(idx, sentence_tags[idx]) for idx in nonce_idxs]
    # Add nonce marker for root verb.
    root_idx = len(left)
    nonce_data += [(root_idx, item_row.verb_form_tag)]

    return sentence, nonce_data, root_idx


def prepare_block_sequences(df, items_per_sequence=2):
    """
    Prepare as many item blocks as possible without repeating items.

    Render sentences with novel nonce words for every single sentence.
    """
    scenes_per_item_verb = len(next(iter(df.groupby(level=["item_idx", "verb"]))))

    combs = []
    items = set(df.index.get_level_values("item_idx"))
    for item_comb in itertools.combinations(items, items_per_sequence):
        # Make sure we don't have repeat verbs.
        verbs = df.loc[list(item_comb)]
        if verbs.reset_index().verb.value_counts().max() > scenes_per_item_verb:
            continue

        combs.append(item_comb)

    for item_comb in tqdm(combs):
        # Compute possible blocks per item.
        blocks = defaultdict(list)
        noncer = Noncer(nonce_df)
        nonce_verb_info = {}

        for item_idx in item_comb:
            item_rows = df.loc[item_idx]
            for test_verb in set(item_rows.verb):
                blocks, nonce_verb_info[test_verb] = prepare_blocks(item_rows, test_verb, noncer)
                blocks[item_idx].append(blocks)

        # Convert from dataframe rows to dicts.
        nonce_verb_info = {verb: row.to_dict() for verb, row in nonce_verb_info.items()}

        # Now yield all possible block sequences.
        for block_seq in itertools.product(*blocks):
            yield block_seq, nonce_verb_info


def prepare_blocks(item_rows, test_verb, noncer):
    """
    Compute all possible item blocks (sequences of scene--sentences) for the
    given verb within the given item.

    Returns:
        blocks: List of sequences of scene--sentence
            presentations, effectively all possible combinations of sentence
            and scenes.
        nonce_row: nonce information used to produce the nonced sentences
    """
    item_idx = item_rows.index[0]

    block_sentences, nonce_info = prepare_block_sentences(item_rows, test_verb, noncer)
    block_scenes = set(item_rows.scene)

    blocks = []
    for scene_order in itertools.permutations(block_scenes):
        blocks.append((item_idx, zip(scene_order, block_sentences)))

    return blocks, nonce_info


def prepare_block_sentences(item_rows, test_verb, noncer):
    """
    Compute nonced sentence presentations for the given verb within the given
    item.
    """
    block_sentences = []

    # Maps verb stem to nonce row.
    # This helps us bridge nonces across different sentences which might use
    # the same verb in different forms.
    verb_nonces = noncer.get_nonce_row(test_verb)

    verb_rows = item_rows[item_rows.verb == test_verb]
    for _, row in verb_rows.iterrows():
        try:
            sentence, nonce_data, root_idx = prepare_sentence_nonces(row)
        except:
            L.error("Failed to prepare sentence row: %s", row)
            raise

        # look up relevant nonce morphological form
        verb_nonce = verb_nonces["form_%s" % row.verb_form_tag]

        # Nonce the whole sentence, ensuring that the verb gets a certain form.
        nonced_sentence, used_nonces = noncer.nonce_sentence(
                sentence, nonce_data,
                overrides={root_idx: verb_nonce})

        block_sentences.append({
            "verb_stem": verb,
            "verb_form": row.verb_form,
            "verb_nonce": verb_nonce,
            "verb_nonce_stem": verb_nonces.form_stem,

            "sentence": sentence,
            "sentence_nonce": nonced_sentence,
            "used_nonces": used_nonces,
        })

    return block_sentences, verb_nonces


@memoize
def get_scene_image_url(scene_id):
    metadata = requests.get("https://visualgenome.org/api/v0/images/%i?format=json" % scene_id).json()
    return metadata["url"]


def prepare_item_seq_dict(item_seq):
    ret = {"items": []}
    for item_verbs, item_trials in item_seq:
        trials = []

        # Pre-process trial data
        for trial in item_trials:
            (item_idx, scene), sentence_data = trial

            # scene_image_path = "%s/%i.jpg" % (SCENE_IMAGES_PATH, scene)
            # if not Path(scene_image_path).exists():
            #     L.error("Scene image %i at %s does not exist. Downloading.",
            #             scene, scene_image_path)
            scene_image_url = get_scene_image_url(scene)

            trials.append({
                "item_idx": item_idx,
                "scene": scene,
                "scene_image_url": scene_image_url,

                "sentence_data": sentence_data,
            })

        ret["items"].append({
            "verbs": item_verbs,
            "trials": trials
        })

    return ret


def main(args):
    item_seqs = prepare_item_sequences(materials_df, items_per_sequence=args.items_per_sequence)
    item_seqs = [prepare_item_seq_dict(item_seq) for item_seq in item_seqs]

    print("Saving to ", args.out_path)
    with args.out_path.open("w") as out_f:
        json.dump(item_seqs, out_f)


if __name__ == "__main__":
    # Prepare item sequence and save to .json
    p = ArgumentParser()
    p.add_argument("-o", "--out_path", type=Path, default=Path("/materials/all_items.json"))
    p.add_argument("-i", "--items_per_sequence", type=int, default=3)

    main(p.parse_args())
