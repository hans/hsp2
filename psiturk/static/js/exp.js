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

var iti_block = {
  type: "html-keyboard-response",
  stimulus: "<div style='font-size: 20pt;'>Please wait&hellip;</div>",
  choices: jsPsych.NO_KEYS,
  trial_duration: 1000,
  on_finish: function() {
    psiturk.startTask();
  },
};

var comments_block = {
  type: "survey-text",
  // TODO
  preamble: "<p>Thanks for participating in our study. You earned the <strong>full performance bonus</strong> of $0.10, and will be compensated $0.30 in total.</p><p><strong>Click \"Finish\" to complete the experiment and receive compensation.</strong> If you have any comments, please let us know in the form below.</p>",
  questions: [{prompt: "Do you have any comments to share with us?"}],
  button_label: "Finish",
};

var R = jsPsych.randomization;

$.getJSON("/item_seq", {uniqueId: uniqueId}, function(item_seq) {
  setup_experiment(item_seq)
});

var setup_experiment = function(data) {
  var preload_images = [];

  var item_blocks = $.map(data["items"], function(item) {
    var all_real_verbs = $.map(item["verbs"], v => v[0])
    var all_nonce_verbs = $.map(item["verbs"], v => v[1])

    var item_intro_block = {
      type: "instructions",
      show_clickable_nav: true,
      pages: [
        "<p>We are now going to study these Zarf verbs:</p>"
        + $.map(all_nonce_verbs, verb =>
          "<p class='zarf-verb'>" + verb + "</p>").join("")
        + "<p>We will hear Zarf speakers use these verbs to describe things they see.</p>"
        + "<p>Next, we'll ask you to guess their translations in English.</p>"
      ]
    }

    // sentence pair -- scene training blocks
    var training_blocks = $.map(R.shuffle(item["trials"]), function(trial) {
      preload_images.push(trial.scene_image_url);

      var prompt = "<p class='quiet-instructions'>Read the below and then press any key to proceed.</p><p>The Zarf speaker saw the following scene and described it with the sentences:</p>";
      var sentences = $.map(trial["sentence_data"], function(sentence_data) {
        // TODO verb condition
        return "<p class='zarf-sentence' data-verb='" + sentence_data[0] + "'>" +
          sentence_data[1] + "</p>"
      })
      prompt += sentences.join("");

      var image_html = "<img class='stim-image' src='" + trial.scene_image_url + "' style='max-height: 300px;' />"
      assert(all_nonce_verbs.length == 2);
      var query = "<p>What might <strong>" + all_nonce_verbs[0] + "</strong> and <strong>" + all_nonce_verbs[1] + "</strong> mean?</p>"
      var stimulus = prompt + query + image_html;

      var scene_block = {
        type: "html-keyboard-response",
        stimulus: stimulus,
        choices: jsPsych.ALL_KEYS,
        post_trial_gap: 1000,
      };
      return scene_block;
    });

    var test_questions = $.map(item["verbs"], function(verb) {
      var verb_real = verb[0];
      var verb_nonce = verb[1];
      return {
        prompt: "What is the most likely meaning of the word <strong>" + verb_nonce + "</strong>?",
        options: all_real_verbs,
        required: true,
        name: "meaning/" + verb_real,
      }
    });

    console.log(test_questions)

    var test_block = {
      type: "survey-multi-choice",
      preamble: "Our linguists think the verbs <strong>" + all_nonce_verbs[0] + "</strong> and <strong>" + all_nonce_verbs[1] + "</strong> might have the following English translations, but aren't sure which Zarf word maps to which English word. Please provide your best guess about the correct mapping.",
      questions: test_questions,
      randomize_question_order: true,
    }

    return [item_intro_block].concat(training_blocks).concat([test_block])
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

