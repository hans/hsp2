import json
from pathlib import Path
import random

import logging

from flask import Blueprint, jsonify, send_file

from psiturk.psiturk_config import PsiturkConfig
from psiturk.user_utils import PsiTurkAuthorization

logging.basicConfig(level=logging.DEBUG)
L = logging.getLogger(__name__)


config = PsiturkConfig()
config.load_config()
myauth = PsiTurkAuthorization(config) # if you want to add a password protected route use this

# explore the Blueprint
custom_code = Blueprint("custom_code", __name__, template_folder="templates", static_folder="static")


block_sequences_f = Path("/materials/all_items.json")
with block_sequences_f.open("r") as blocks_f:
    BLOCK_SEQUENCES = json.load(blocks_f)["block_sequences"]


###############
# custom routes

@custom_code.route("/item_seq", methods=["GET"])
def get_item_seq():
    # TODO maybe not random sample, but ensure balanced sample
    item_seq = random.choice(BLOCK_SEQUENCES)
    return jsonify(item_seq)
