from pathlib2 import Path
import random

import logging

from flask import Blueprint, jsonify, send_file

from psiturk.psiturk_config import PsiturkConfig
from psiturk.user_utils import PsiTurkAuthorization

import materials

logging.basicConfig(level=logging.DEBUG)
L = logging.getLogger(__name__)


config = PsiturkConfig()
config.load_config()
myauth = PsiTurkAuthorization(config) # if you want to add a password protected route use this

# explore the Blueprint
custom_code = Blueprint("custom_code", __name__, template_folder="templates", static_folder="static")


SCENE_IMAGES_PATH = "/static/scenes"

def prepare_item_seq_dict(item_seq):
    # TODO we shouldn't have duplicate scenes in the sequence .. what's wrong
    # TODO consistent nonceing of verbs across trials

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
            scene_image_url = materials.get_scene_image_url(scene)

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

# prepare trial sequences.
ITEMS_PER_SEQUENCE = 2
ITEM_SEQUENCES = [
    prepare_item_seq_dict(item_seq)
    for item_seq in materials.prepare_item_sequences(materials.materials_df, items_per_sequence=ITEMS_PER_SEQUENCE)
]

###############
# custom routes

@custom_code.route("/item_seq", methods=["GET"])
def get_item_seq():
    # TODO maybe not random sample, but ensure balanced sample
    item_seq = random.choice(ITEM_SEQUENCES)
    return jsonify(item_seq)


if __name__ == "__main__":
    from pprint import pprint
    pprint(ITEM_SEQUENCES)
