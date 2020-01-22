from pathlib2 import Path
import random

import logging
logging.basicConfig(level=logging.DEBUG)
L = logging.getLogger(__name__)

from flask import Blueprint, jsonify, send_file

from psiturk.psiturk_config import PsiturkConfig
from psiturk.user_utils import PsiTurkAuthorization

from . import materials


config = PsiturkConfig()
config.load_config()
myauth = PsiTurkAuthorization(config) # if you want to add a password protected route use this

# explore the Blueprint
custom_code = Blueprint("custom_code", __name__, template_folder="templates", static_folder="static")


SCENE_IMAGES_PATH = "/static/scenes"

# prepare trial sequences.
ITEMS_PER_SEQUENCE = 2
TRIAL_SEQUENCES = [
    prepare_trial_seq_dict(trial_seq)
    for trial_seq in materials.prepare_trial_sequences(materials.materials_df, items_per_sequence=ITEMS_PER_SEQUENCE)
]


def prepare_trial_seq_dict(trial_seq):
    ret = {"trials": []}
    for trial in trial_seqs:
        (item_idx, scene, verb), sentence, used_nonces = trial

        # scene_image_path = "%s/%i.jpg" % (SCENE_IMAGES_PATH, scene)
        # if not Path(scene_image_path).exists():
        #     L.error("Scene image %i at %s does not exist. Downloading.",
        #             scene, scene_image_path)
        scene_image_url = materials.get_scene_image_url(scene)

        ret["trials"].append({
            "item_idx": item_idx,
            "scene": scene,
            "verb": verb,

            "scene_image_url": scene_image_url,

            "sentence": sentence,
            "used_nonces": used_nonces,
        })

    return ret


@custom_code.route("/trial_seq", methods=["GET"])
def get_trial_seq():
    # TODO maybe not random sample, but ensure balanced sample
    trial_seq = random.choice(TRIAL_SEQUENCES)
    return jsonify(trial_seq)

