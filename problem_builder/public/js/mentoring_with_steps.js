function MentoringWithStepsBlock(runtime, element) {

    // Set up gettext in case it isn't available in the client runtime:
    if (typeof gettext == "undefined") {
        window.gettext = function gettext_stub(string) { return string; };
        window.ngettext = function ngettext_stub(strA, strB, n) { return n == 1 ? strA : strB; };
    }

    var children = runtime.children(element);
    var steps = [];

    for (var i = 0; i < children.length; i++) {
        var child = children[i];
        var blockType = $(child.element).data('block-type');
        if (blockType === 'sb-step') {
            steps.push(child);
        }
    }

    var activeStep = $('.mentoring', element).data('active-step');
    var attemptsTemplate = _.template($('#xblock-attempts-template').html());
    var message = $('.sb-step-message', element);
    var checkmark, submitDOM, nextDOM, reviewButtonDOM, tryAgainDOM,
        gradeDOM, attemptsDOM, reviewLinkDOM, submitXHR;
    var reviewStepDOM = $("div.xblock[data-block-type=sb-review-step], div.xblock-v1[data-block-type=sb-review-step]", element);
    var hasAReviewStep = reviewStepDOM.length == 1;

    function isLastStep() {
        return (activeStep === steps.length-1);
    }

    function atReviewStep() {
        return (activeStep === -1);
    }

    function someAttemptsLeft() {
        var data = attemptsDOM.data();
        if (data.max_attempts === 0) { // Unlimited number of attempts available
            return true;
        }
        return (data.num_attempts < data.max_attempts);
    }

    function showFeedback(response) {
        if (response.step_status === 'correct') {
            checkmark.addClass('checkmark-correct icon-ok fa-check');
        } else if (response.step_status === 'partial') {
            checkmark.addClass('checkmark-partially-correct icon-ok fa-check');
        } else {
            checkmark.addClass('checkmark-incorrect icon-exclamation fa-exclamation');
        }
        var step = steps[activeStep];
        if (typeof step.showFeedback == 'function') {
            step.showFeedback(response);
        }
    }

    function updateControls() {
        submitDOM.attr('disabled', 'disabled');

        nextDOM.removeAttr("disabled");
        if (nextDOM.is(':visible')) { nextDOM.focus(); }

        if (atReviewStep()) {
            if (hasAReviewStep) {
                reviewButtonDOM.removeAttr('disabled');
            } else {
                if (someAttemptsLeft()) {
                    tryAgainDOM.removeAttr('disabled');
                    tryAgainDOM.show();
                } else {
                    showAttempts();
                }
            }
        }
    }

    function submit() {
        submitDOM.attr('disabled', 'disabled'); // Disable the button until the results load.
        var submitUrl = runtime.handlerUrl(element, 'submit');

        var hasQuestion = steps[activeStep].hasQuestion();
        var data = steps[activeStep].getSubmitData();
        data["active_step"] = activeStep;
        $.post(submitUrl, JSON.stringify(data)).success(function(response) {
            showFeedback(response);
            activeStep = response.active_step;
            if (activeStep === -1) {
                // We are now showing the review step / end
                // Update the number of attempts.
                attemptsDOM.data('num_attempts', response.num_attempts);
                reviewStepDOM.html($(response.review_html).html());
                updateControls();
            } else if (!hasQuestion) {
                // This was a step with no questions, so proceed to the next step / review:
                updateDisplay();
            } else {
                // Enable the Next button so users can proceed.
                updateControls();
            }
        });
    }

    function getResults() {
        var step = steps[activeStep];
        step.getResults(handleReviewResults);
    }

    function handleReviewResults(response) {
        // Show step-level feedback
        showFeedback(response);
        // Forward to active step to show answer level feedback
        var step = steps[activeStep];
        var results = response.results;
        var options = {
            checkmark: checkmark
        };
        step.handleReview(results, options);
    }

    function hideAllSteps() {
        for (var i=0; i < steps.length; i++) {
            $(steps[i].element).hide();
        }
    }

    function clearSelections() {
        $('input[type=radio], input[type=checkbox]', element).prop('checked', false);
    }

    function cleanAll() {
        checkmark.removeClass('checkmark-correct icon-ok fa-check');
        checkmark.removeClass('checkmark-partially-correct icon-ok fa-check');
        checkmark.removeClass('checkmark-incorrect icon-exclamation fa-exclamation');
        hideAllSteps();
        hideReviewStep();
        attemptsDOM.html('');
        message.hide();
    }

    function updateNextLabel() {
        var step = steps[activeStep];
        nextDOM.attr('value', step.getStepLabel());
    }

    function updateDisplay() {
        cleanAll();

        if (atReviewStep()) {
            // Tell supporting runtimes to enable navigation between units;
            // user is currently not in the middle of an attempt
            // so it makes sense for them to be able to leave the current unit by clicking arrow buttons
            notify('navigation', {state: 'unlock'});

            showReviewStep();
            showAttempts();
        } else {
            showActiveStep();
            validateXBlock();
            updateNextLabel();

            // Reinstate default event handlers
            nextDOM.off('click');
            nextDOM.on('click', updateDisplay);
            reviewButtonDOM.on('click', showGrade);

            var step = steps[activeStep];
            if (step.hasQuestion()) {  // Step includes one or more questions
                nextDOM.attr('disabled', 'disabled');
                submitDOM.show();
                if (isLastStep()) {  // Step is last step
                    nextDOM.hide();
                    if (hasAReviewStep) {  // Step Builder includes review step
                        reviewButtonDOM.attr('disabled', 'disabled');
                        reviewButtonDOM.show();
                    }
                }
            } else {  // Step does not include any questions
                nextDOM.removeAttr('disabled');
                submitDOM.hide();
                if (isLastStep()) {  // Step is last step
                    // Remove default event handler from button that displays review.
                    // This is necessary to make sure updateDisplay is not called twice
                    // when user clicks this button next;
                    // "submit" already does the right thing with respect to updating the display,
                    // and calling updateDisplay twice causes issues with scrolling behavior:
                    reviewButtonDOM.off();
                    reviewButtonDOM.one('click', submit);
                    reviewButtonDOM.removeAttr('disabled');
                    nextDOM.hide();
                    if (hasAReviewStep) {  // Step Builder includes review step
                        reviewButtonDOM.show();
                    }
                } else {  // Step is not last step
                    // Remove default event handler from button that displays next step.
                    // This is necessary to make sure updateDisplay is not called twice
                    // when user clicks this button next;
                    // "submit" already does the right thing with respect to updating the display,
                    // and calling updateDisplay twice causes issues with scrolling behavior:
                    nextDOM.off();
                    nextDOM.one('click', submit);
                }
            }
        }

        // Scroll to top of this block
        scrollIntoView();
    }

    function showReviewStep() {
        if (someAttemptsLeft()) {
            tryAgainDOM.removeAttr('disabled');
        }

        submitDOM.hide();
        nextDOM.hide();
        reviewButtonDOM.hide();
        tryAgainDOM.show();

        reviewStepDOM.show();
    }

    function hideReviewStep() {
        reviewStepDOM.hide();
    }

    function getStepToReview(event) {
        event.preventDefault();
        var stepIndex = parseInt($(event.target).data('step')) - 1;
        jumpToReview(stepIndex);
    }

    function jumpToReview(stepIndex) {
        activeStep = stepIndex;
        cleanAll();
        showActiveStep();
        updateNextLabel();

        if (isLastStep()) {
            reviewButtonDOM.show();
            reviewButtonDOM.removeAttr('disabled');
            nextDOM.hide();
            nextDOM.attr('disabled', 'disabled');
        } else {
            nextDOM.show();
            nextDOM.removeAttr('disabled');
        }
        var step = steps[activeStep];

        tryAgainDOM.hide();
        if (step.hasQuestion()) {
            submitDOM.show();
        } else {
            submitDOM.hide();
        }
        submitDOM.attr('disabled', 'disabled');
        reviewLinkDOM.show();

        getResults();

        // Scroll to top of this block
        scrollIntoView();
    }

    function showAttempts() {
        var data = attemptsDOM.data();
        if (data.max_attempts > 0) {
            attemptsDOM.html(attemptsTemplate(data));
        } // Don't show attempts if unlimited attempts available (max_attempts === 0)
    }

    function showActiveStep() {
        var step = steps[activeStep];
        $(step.element).show();
        step.updateChildren();
    }

    function onChange() {
        // We do not allow users to modify answers belonging to a step after submitting them:
        // Once an answer has been submitted ("Next Step" button is enabled),
        // start ignoring changes to the answer.
        if (nextDOM.attr('disabled')) {
            validateXBlock();
        }
    }

    function validateXBlock() {
        var isValid = true;
        var step = steps[activeStep];
        if (step) {
            isValid = step.validate();
        }
        if (!isValid) {
            submitDOM.attr('disabled', 'disabled');
        } else {
            submitDOM.removeAttr('disabled');
        }
    }

    function initSteps(options) {
        for (var i=0; i < steps.length; i++) {
            var step = steps[i];
            var mentoring = {
                setContent: setContent,
                publish_event: publishEvent
            };
            options.mentoring = mentoring;
            step.initChildren(options);
        }
    }

    function setContent(dom, content) {
        dom.html('');
        dom.append(content);
        var template = $('#light-child-template', dom).html();
        if (template) {
            dom.append(template);
        }
    }

    function publishEvent(data) {
        $.ajax({
            type: "POST",
            url: runtime.handlerUrl(element, 'publish_event'),
            data: JSON.stringify(data)
        });
    }

    function showGrade() {
        // Tell supporting runtimes to enable navigation between units;
        // user is currently not in the middle of an attempt
        // so it makes sense for them to be able to leave the current unit by clicking arrow buttons
        notify('navigation', {state: 'unlock'});

        cleanAll();
        showReviewStep();
        showAttempts();

        // Disable "Try again" button if no attempts left
        if (!someAttemptsLeft()) {
            tryAgainDOM.attr("disabled", "disabled");
        }

        nextDOM.off();
        nextDOM.on('click', reviewNextStep);
        reviewLinkDOM.hide();

        // Scroll to top of this block
        scrollIntoView();
    }

    function reviewNextStep() {
        jumpToReview(activeStep+1);
    }

    function handleTryAgain(result) {
        // Tell supporting runtimes to disable navigation between units;
        // this keeps users from accidentally clicking arrow buttons
        // and interrupting their experience with the current unit
        notify('navigation', {state: 'lock'});

        activeStep = result.active_step;
        clearSelections();
        updateDisplay();
        tryAgainDOM.hide();
        submitDOM.show();
        if (! isLastStep()) {
            nextDOM.off();
            nextDOM.on('click', updateDisplay);
            nextDOM.show();
            reviewButtonDOM.hide();
        }
    }

    function tryAgain() {
        var handlerUrl = runtime.handlerUrl(element, 'try_again');
        if (submitXHR) {
            submitXHR.abort();
        }
        submitXHR = $.post(handlerUrl, JSON.stringify({})).success(handleTryAgain);
    }

    function notify(name, data){
        // Notification interface does not exist in the workbench.
        if (runtime.notify) {
            runtime.notify(name, data);
        }
    }

    function scrollIntoView() {
        // This function can be called multiple times per step initialization.
        // We must make sure that only one animation is queued or running at any given time,
        // that's why we use a special animation queue and make sure to .stop() any running/queued
        // animations before enqueueing a new one.
        var rootBlock = $(element),
            rootBlockOffset = rootBlock.offset().top,
            queue = 'sb-scroll',
            props = {scrollTop: rootBlockOffset},
            opts = {duration: 500, queue: queue};
        $('html, body').stop(queue, true).animate(props, opts).dequeue(queue);
    }

    function initClickHandlers() {
        $(document).on("click", function(event, ui) {
            var target = $(event.target);
            var itemFeedbackParentSelector = '.choice';
            var itemFeedbackSelector = ".choice .choice-tips";

            function clickedInside(selector, parent_selector){
                return target.is(selector) || target.parents(parent_selector).length>0;
            }

            if (!clickedInside(itemFeedbackSelector, itemFeedbackParentSelector)) {
                $(itemFeedbackSelector).not(':hidden').hide();
                $('.choice-tips-container').removeClass('with-tips');
            }
        });
    }

    function initXBlockView() {
        // Tell supporting runtimes to disable navigation between units;
        // this keeps users from accidentally clicking arrow buttons
        // and interrupting their experience with the current unit
        notify('navigation', {state: 'lock'});

        // Hide steps until we're ready
        hideAllSteps();

        // Initialize references to relevant DOM elements and set up event handlers
        checkmark = $('.step-overall-checkmark', element);

        submitDOM = $(element).find('.submit .input-main');
        submitDOM.on('click', submit);

        nextDOM = $(element).find('.submit .input-next');
        if (atReviewStep()) {
            nextDOM.on('click', reviewNextStep);
        } else {
            nextDOM.on('click', updateDisplay);
        }

        reviewButtonDOM = $(element).find('.submit .input-review');
        reviewButtonDOM.on('click', showGrade);

        tryAgainDOM = $(element).find('.submit .input-try-again');
        tryAgainDOM.on('click', tryAgain);

        gradeDOM = $('.grade', element);
        attemptsDOM = $('.attempts', element);

        reviewLinkDOM = $(element).find('.review-link');
        reviewLinkDOM.on('click', showGrade);

        // Add click handler that takes care of links to steps on the extended review:
        $(element).on('click', 'a.step-link', getStepToReview);

        // Initialize individual steps
        // (sets up click handlers for questions and makes sure answer data is up-to-date)
        var options = {
            onChange: onChange
        };
        initSteps(options);

        // Refresh info about number of attempts used:
        // In the LMS, the HTML of multiple units can be loaded at once,
        // and the user can flip among them. If that happens, information about
        // number of attempts student has used up may be out of date.
        var handlerUrl = runtime.handlerUrl(element, 'get_num_attempts');
        $.post(handlerUrl, JSON.stringify({}))
            .success(function(response) {
                attemptsDOM.data('num_attempts', response.num_attempts);

                // Finally, show controls and content
                submitDOM.show();
                nextDOM.show();

                updateDisplay();
            });

    }

    initClickHandlers();
    initXBlockView();

}
