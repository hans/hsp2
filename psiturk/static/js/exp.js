/**
* Main experiment logic.
*
* Assumes globals are already set: uniqueId, adServerLoc, mode
*/

/* load psiturk */
var psiturk = new PsiTurk(uniqueId, adServerLoc, mode);
var R = jsPsych.randomization;

var COMPENSATION = "$0.60";

var CONDITIONS = ["verb", "syntax"];

var instructions_block = {
  type: "instructions",
  pages: [
    "<p>Welcome! In this experiment, you will be helping us study the foreign language <em>Zarf</em>, used by humans in a newly discovered civilization. While Zarf speakers have a different language, they live a life remarkably similar to our own: they play the same types of sports, enjoy similar types of music, and do similar kinds of work.</p>",
    "<p>In a remarkable coincidence, linguists have discovered that Zarf <strong>shares many words and grammatical markers with English</strong>. Here are some example Zarf sentences, with non-cognate words shown in color:</p><p class='zarf-sentence'>the <strong>florp</strong> <strong>dax</strong>ed by the window</p><p class='zarf-sentence'>every <strong>gat</strong> is near the <strong>blicket</strong> today</p><p>A team of linguists has recruited you to better understand the English translations of <strong>some verbs in Zarf</strong>.</p>",
  ],
  show_clickable_nav: true,
};

var age_block = {
  type: "survey-text",
  preamble: "Please provide us with some demographic information.",
  questions: [{prompt: "How old are you (in years)?"}]
};

var demo_block = {
  type: "survey-multi-choice",
  questions: [
    {
      prompt: "What is the highest level of education you have completed?",
      options: ["Did not complete high school", "High school/GED", "Some college", "Bachelor's degree", "Master's degree", "Ph.D."],
      required: true
    },
    {
      prompt: "Is English your first language?",
      options: ["Yes", "No"],
      required: true
    }
  ]
};

var comments_block = {
  type: "survey-text",
  // TODO
  preamble: "<p>Thanks for participating in our study. You will be compensated " + COMPENSATION + " in total.</p><p><strong>Click \"Finish\" to complete the experiment and receive compensation.</strong> If you have any comments, please let us know in the form below.</p>",
  questions: [{prompt: "Do you have any comments to share with us?"}],
  button_label: "Finish",
};

$.getJSON("/item_seq", {uniqueId: uniqueId}, function(item_seq) {
  setup_experiment(item_seq)
});

var setup_experiment = function(data) {
  var preload_images = [];
  console.log(data)

  var blocks = $.map(data["blocks"], function(block) {
    var condition = R.sampleWithReplacement(CONDITIONS, 1)[0];

    // TODO assert we only have one contrast verb
    var all_real_verbs = [block.verb, block.contrast_verbs[0]];

    var item_intro_block = {
      type: "instructions",
      show_clickable_nav: true,
      pages: [
        "<p>We are now going to study this Zarf verb:</p>"
        + "<p class='zarf-verb'>" + block.nonce_verb + "</p>"
        + "<p>We will hear Zarf speakers use this verb to describe things they see.</p>"
        + "<p>Next, we'll ask you to guess their translations in English.</p>"
      ],
      data: {
        condition: condition,
        stage: "introduction",
        item_idx: block.item_idx,
        verb: block.verb,
        contrast_verbs: block.contrast_verbs,
        nonce_verb: block.nonce_verb
      }
    }

    // sentence pair -- scene training trials
    var all_sentences = [];
    var all_scenes = [];

    var all_sentence_htmls = [];
    var all_image_htmls = [];
    var training_trials = $.map(R.shuffle(block["trials"]), function(trial) {
      preload_images.push(trial.scene_image_url);

      var prompt = "";
      var sentence_html = null;

      all_sentences.push(trial.sentence_data.sentence);
      all_scenes.push(trial.scene);

      if (condition == "syntax") {
        prompt += "<p>The Zarf speaker saw the following scene and described it with the sentence:</p>";
        sentence_html = "<p class='zarf-sentence' data-verb='" + trial.sentence_data.verb.stem + "'>" +
          trial.sentence_data.sentence_nonce.replace(
            trial.sentence_data.nonce_verb.form,
            "<strong>" + trial.sentence_data.nonce_verb.form + "</strong>") +
          "</p>";
      } else if (condition == "verb") {
        prompt += "<p>The Zarf speaker saw the following scene and provided a sentence, but <strong>we've lost everything but the verb they used.</strong> Try to guess what these words mean based on the scene.</p>";

        sentence_html = "<p class='zarf-sentence' data-verb='" + trial.sentence_data.verb.stem + "'>" +
          "<span class='noise'>#####</span> <strong>" + trial.sentence_data.nonce_verb.form + "</strong> <span class='noise'>#####</span> !</p>";
      }

      prompt += sentence_html;
      all_sentence_htmls.push(sentence_html);

      var image_html = "<img class='stim-image' src='" + trial.scene_image_url + "' style='max-height: 300px;' />";
      all_image_htmls.push(image_html);
      var query = "<p>What might <strong>" + trial.sentence_data.nonce_verb.form + "</strong> mean?</p>"
      var stimulus = prompt + query + image_html;

      var scene_trial = {
        type: "delayed-html-keyboard-response",
        stimulus: stimulus,
        choices: jsPsych.ALL_KEYS,
        min_trial_duration: 4000,
        post_trial_gap: 250,
        data: {
          condition: condition,
          stage: "train",

          item_idx: block.item_idx,
          verb: block.verb,
          contrast_verbs: block.contrast_verbs,
          nonce_verb: block.nonce_verb,

          sentence: trial.sentence_data.sentence,
          scene: trial.scene,
        }
      };
      return scene_trial;
    });

    var test_labels = R.shuffle(all_real_verbs);

    var train_summary = $.map(all_sentence_htmls, function(sentence_html, i) {
      var image_html = all_image_htmls[i];
      return "<div class='trial-summary'>"+ sentence_html + image_html + "</div>";
    }).join("");
    console.log(train_summary);

    var test_trial = {
      type: "html-slider-response",
      stimulus: "<div style='margin: auto'><p>You saw the following examples:</p>" + train_summary + "<br style='clear: left' /><p>Our linguists think that the verb <strong>" + block.nonce_verb + "</strong> might have the following English translations, but aren't sure exactly which. Please provide your best guess about the correct mapping.</p></div>",
      labels: test_labels,
      require_movement: true,

      data: {
        condition: condition,
        stage: "test",

        item_idx: block.item_idx,
        verb: block.verb,
        contrast_verbs: block.contrast_verbs,
        nonce_verb: block.nonce_verb,

        sentences: all_sentences,
        scenes: all_scenes,

        slider_labels: test_labels,
      },
    }

    var item_chunk = {
      chunk_type: "linear",
      timeline: [item_intro_block].concat(training_trials).concat([test_trial]),
    }
    return item_chunk;
  });;

  /* define experiment structure */

  var experiment_blocks = [];

  // DEV
  experiment_blocks.push(instructions_block);
  experiment_blocks.push(age_block);
  experiment_blocks.push(demo_block);

  experiment_blocks = experiment_blocks.concat(blocks)

  experiment_blocks.push(comments_block);


  /* start the experiment */

  jsPsych.init({
    timeline: experiment_blocks,
    show_progress_bar: true,
    preload_images: preload_images,

    on_finish: function() {
      psiturk.saveData({
        success: function() { psiturk.completeHIT(); },
        error: function() { console.log("error saving data"); }
      });
    },
    on_data_update: function(data) {
      psiturk.recordTrialData(data);
    },
  });
};

