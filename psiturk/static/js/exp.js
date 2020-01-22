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
    "Welcome!", // TODO
    "<p>In this experiment, ...</p>" // TODO"we will ask you to <strong>validate statements " +
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

$.getJSON("/item_seq", {uniqueId: uniqueId}, function(item_seq) {
  setup_experiment(item_seq)
});

var setup_experiment = function(data) {
  var train_trials = $.map(data["items"], function(item) {
    return $.map(item, function(trial) {
      var scene_block = {
        type: "image-keyboard-response",
        stimulus: trial.scene_image_url, // TODO preload
        choices: jsPsych.NO_KEYS,
        prompt: "Testing", // TODO
        trial_duration: 5000,
      };
      return [scene_block, iti_block];
    });
  });;

  // TODO test trials

  /* define experiment structure */

  var experiment_blocks = [];

  experiment_blocks.push(instructions_block);
  experiment_blocks.push(age_block);
  experiment_blocks.push(demo_block);
  experiment_blocks.push(iti_block);

  experiment_blocks = experiment_blocks.concat(train_trials)

  experiment_blocks.push(comments_block);


  /* start the experiment */

  jsPsych.init({
    timeline: experiment_blocks,
    on_finish: function() {
      psiturk.saveData({
        success: function() { psiturk.completeHIT(); },
        error: function() { console.log("error saving data"); }
      });
    },
    on_data_update: function(data) {
      psiturk.recordTrialData(data);
    }
  });
};

