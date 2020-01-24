/**
* Main experiment logic.
*
* Assumes globals are already set: uniqueId, adServerLoc, mode
*/

/* load psiturk */
var psiturk = new PsiTurk(uniqueId, adServerLoc, mode);

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
  preamble: "<p>Thanks for participating in our study. You earned the <strong>full performance bonus</strong> of $0.10, and will be compensated $0.30 in total.</p><p><strong>Click \"Finish\" to complete the experiment and receive compensation.</strong> If you have any comments, please let us know in the form below.</p>",
  questions: [{prompt: "Do you have any comments to share with us?"}],
  button_label: "Finish",
};

var R = jsPsych.randomization;

var CONDITIONS = ["verb", "syntax"];

$.getJSON("/item_seq", {uniqueId: uniqueId}, function(item_seq) {
  setup_experiment(item_seq)
});

var setup_experiment = function(data) {
  var preload_images = [];
  console.log(data)

  var item_blocks = $.map(data["items"], function(item) {
    var condition = R.sampleWithReplacement(CONDITIONS, 1)[0];

    var all_real_verbs = $.map(item["verbs"], (forms, verb) => verb)
    var all_nonce_verbs = $.map(item["verbs"], (forms, verb) => forms.form_stem)

    var item_intro_block = {
      type: "instructions",
      show_clickable_nav: true,
      pages: [
        "<p>We are now going to study these Zarf verbs:</p>"
        + $.map(all_nonce_verbs, verb =>
          "<p class='zarf-verb'>" + verb + "</p>").join("")
        + "<p>We will hear Zarf speakers use these verbs to describe things they see.</p>"
        + "<p>Next, we'll ask you to guess their translations in English.</p>"
      ],
      data: {condition: condition}
    }

    // sentence pair -- scene training blocks
    var all_sentence_htmls = [];
    var training_blocks = $.map(R.shuffle(item["trials"]), function(trial) {
      preload_images.push(trial.scene_image_url);

      var prompt = "<p class='quiet-instructions'>Read the below and then press any key to proceed.</p>";
      var trial_sentences = R.shuffle(trial["sentence_data"])

      var sentence_htmls = [];
      if (condition == "syntax") {
        prompt += "<p>The Zarf speaker saw the following scene and described it with the sentences:</p>";
        sentence_htmls = $.map(trial_sentences, function(sentence_data) {
          var sentence_html = sentence_data.sentence_nonce.replace(
            sentence_data.verb_nonce, "<strong>" + sentence_data.verb_nonce + "</strong>");
          return "<p class='zarf-sentence' data-verb='" + sentence_data.verb_stem + "'>" +
            sentence_html + "</p>";
        })

      } else if (condition == "verb") {
        prompt += "<p>The Zarf speaker saw the following scene and provided a sentence, but <strong>we've lost everything but the verb they used.</strong> Try to guess what these words mean based on the scene.</p>";
        sentence_htmls = $.map(trial_sentences, function(sentence_data) {
          return "<p class='zarf-sentence' data-verb='" + sentence_data.verb_stem + "'>" +
            "<span class='noise'>#####</span> <strong>" + sentence_data.verb_nonce + "</strong> <span class='noise'>#####</span> !</p>";
        })
      }

      prompt += sentence_htmls.join("");
      all_sentence_htmls = all_sentence_htmls.concat(sentence_htmls);

      var image_html = "<img class='stim-image' src='" + trial.scene_image_url + "' style='max-height: 300px;' />"
      assert(all_nonce_verbs.length == 2);
      var query = "<p>What might <strong>" + all_nonce_verbs[0] + "</strong> and <strong>" + all_nonce_verbs[1] + "</strong> mean?</p>"
      var stimulus = prompt + query + image_html;

      var scene_block = {
        type: "html-keyboard-response",
        stimulus: stimulus,
        choices: jsPsych.ALL_KEYS,
        post_trial_gap: 1000,
        data: {
          condition: condition
        }
      };
      return scene_block;
    });

    var test_verb_sequence = R.shuffle(Object.keys(item["verbs"]))
    console.log(test_verb_sequence)
    var test_questions = $.map(test_verb_sequence, function(verb) {
      var verb_nonce = item["verbs"][verb].form_stem;
      return {
        prompt: "What is the most likely meaning of the word <strong>" + verb_nonce + "</strong>?",
        options: R.shuffle(all_real_verbs),
        required: true,
        name: "meaning/" + verb,
      }
    });

    var test_block = {
      type: "survey-multi-choice",
      preamble: "<p>You saw the following sentences:</p>" + all_sentence_htmls.join("") + "<p>Our linguists think the verbs <strong>" + all_nonce_verbs[0] + "</strong> and <strong>" + all_nonce_verbs[1] + "</strong> might have the following English translations, but aren't sure exactly which Zarf word maps to which English word. Please provide your best guess about the correct mapping.</p>",
      questions: test_questions,
      data: {
        condition: condition,
        verb_sequence: test_verb_sequence
      },
    }

    var item_chunk = {
      chunk_type: "linear",
      timeline: [item_intro_block].concat(training_blocks).concat([test_block]),
      data: {foo: "test"},
    }
    return item_chunk;
  });;

  /* define experiment structure */

  var experiment_blocks = [];

  // DEV
  experiment_blocks.push(instructions_block);
  // experiment_blocks.push(age_block);
  // experiment_blocks.push(demo_block);
  // experiment_blocks.push(iti_block);

  experiment_blocks = experiment_blocks.concat(item_blocks)

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

