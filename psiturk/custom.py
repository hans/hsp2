from pathlib2 import Path
import random

import logging
logging.basicConfig(level=logging.DEBUG)
L = logging.getLogger(__name__)

from flask import Blueprint, jsonify, send_file

from psiturk.psiturk_config import PsiturkConfig
from psiturk.user_utils import PsiTurkAuthorization

import materials


config = PsiturkConfig()
config.load_config()
myauth = PsiTurkAuthorization(config) # if you want to add a password protected route use this

# explore the Blueprint
custom_code = Blueprint("custom_code", __name__, template_folder="templates", static_folder="static")


SCENE_IMAGES_PATH = "/static/scenes"

def prepare_item_seq_dict(item_seq):
    ret = {"items": []}
    for item in item_seq:
        item_ret = []
        for trial in item:
            (item_idx, scene), sentence_data = trial

            # scene_image_path = "%s/%i.jpg" % (SCENE_IMAGES_PATH, scene)
            # if not Path(scene_image_path).exists():
            #     L.error("Scene image %i at %s does not exist. Downloading.",
            #             scene, scene_image_path)
            scene_image_url = materials.get_scene_image_url(scene)

            item_ret.append({
                "item_idx": item_idx,
                "scene": scene,
                "scene_image_url": scene_image_url,

                "sentence_data": sentence_data,
            })

        ret["items"].append(item_ret)

    from pprint import pprint
    pprint(ret)

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

    # TODO shuffle trials?

    return jsonify(item_seq)

