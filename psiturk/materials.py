from collections import defaultdict, Counter
import itertools
import logging
from pathlib2 import Path
import random
import re
import requests

import spacy
import pandas as pd

L = logging.getLogger(__name__)

# load spacy model
nlp = spacy.load("en")

# load materials
MATERIALS_PATH = Path("/materials")
ITEMS_PATH = MATERIALS_PATH / "items.csv"
NONCE_PATH = MATERIALS_PATH / "nonces.csv"

materials_df = pd.read_csv(ITEMS_PATH, encoding="utf-8", index_col=["item_idx", "scene", "verb"])
nonce_df = pd.read_csv(NONCE_PATH, encoding="utf-8", index_col=["stem"])

# regex for matching function words in sentences specified in materials
function_re = re.compile(r"\[([^\]]+)\]")


class Noncer(object):
    """
    Stateful utility for nonce-ing sentences.
    """
    def __init__(self, nonce_df):
        self.nonce_df = nonce_df

        self.used_nonces = Counter()
        self._pull_nonces()

    def _pull_nonces(self):
        self.available_nonces = list(self.nonce_df.index)
        random.shuffle(self.available_nonces)

    @classmethod
    def from_nonce_csv(cls, nonce_csv):
        return cls(pd.read_csv(nonce_csv, encoding="utf-8", index_col=0))

    def nonce(self, word, tag=None):
        if len(self.available_nonces) == 0:
            L.warn("Ran out of unique nonces. Re-using past nonces.")
            self._pull_nonces()

        stem = self.available_nonces.pop()
        self.used_nonces[stem] += 1

        row = self.nonce_df.loc[stem]

        if "form_%s" % tag in row.index:
            ret = row["form_%s" % tag]
        else:
            ret = stem

        return ret, stem

    def nonce_sentence(self, sentence, nonce_data):
        sentence_tokens = sentence.strip().split(" ")
        sentence_nonces = []
        for idx, tag in nonce_data:
            sentence_tokens[idx], used_nonce = self.nonce(sentence_tokens[idx], tag)
            sentence_nonces.append(used_nonce)

        sentence = " ".join(sentence_tokens)
        return sentence, sentence_nonces


def prepare_sentence_nonces(item_row):
    """
    Given an item row, return a pair `(sentence, nonce_data)`, where `sentence`
    is a joined natural language sentence and `nonce_data` is a tuple `(index,
    pos_tag)`, specifying indices at which to nonce words, and their original
    part of speech.

    Args:
      item_row:
      which: Which sentence (1 or 2, integer).
    """
    left, gerund, right = item_row[["sentence_left", "gerund", "sentence_right"]]
    left, right = left.strip().split(" "), right.strip().split(" ")

    # Parse sentence and get morphological information.
    sentence = " ".join(left + [gerund] + right)
    sentence = function_re.sub(r"\1", sentence)
    parsed = nlp(sentence)
    sentence_tags = [t.tag_ for t in parsed]

    nonce_idxs = [idx for idx, word in enumerate(left)
                  if not function_re.match(word)]
    nonce_idxs += [idx + len(left) + 1 for idx, word in enumerate(right)
                   if not function_re.match(word)]
    nonce_data = [(idx, sentence_tags[idx]) for idx in nonce_idxs]
    # Add nonce marker for root verb.
    nonce_data += [(len(left), "VBG")]

    return sentence, nonce_data


def prepare_trial_sequences(df, items_per_sequence=2):
    """
    Prepare as many sequences of verb pairs as possible without repeating
    verbs.

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

    for item_comb in combs:
        trials = []
        noncer = Noncer(nonce_df)

        for item_idx in item_comb:
            for row_idx, row in df.loc[item_idx].iterrows():
                sentence, nonce_data = prepare_sentence_nonces(row)
                nonced_sentence, used_nonces = noncer.nonce_sentence(sentence, nonce_data)

                idx = (item_idx,) + row_idx
                trials.append((idx, nonced_sentence, used_nonces))

        yield trials


def get_scene_image_url(scene_id):
    metadata = requests.get("https://visualgenome.org/api/v0/images/%i?format=json" % scene_id).json()
    return metadata["url"]
