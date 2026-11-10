(function () {
  const subjects = window.alSubjects;
  const copy = window.alCopy;
  const statsApi = window.CommunityStats;
  const historicalStats = window.historicalStats || {};
  const config = window.COMMUNITY_CONFIG || {};
  const languageButtons = document.querySelectorAll('[data-lang]');
  const subjectGrid = document.querySelector('#subject-grid');
  const contribute = document.querySelector('#contribute');
  const contributionDialog = document.querySelector('#contribution-dialog');
  const contributionPrompt = document.querySelector('#contribution-prompt');
  const validation = document.querySelector('#validation');
  const calculatorForm = document.querySelector('#calculator-form');
  const communityStatus = document.querySelector('#community-status');
  const toast = document.querySelector('#toast');
  let language = 'en';
  let marksBySubject = {};
  let searchBySlot = ['', '', ''];
  let communityStats = {};
  let communityState = 'loading';
  let lastResult = null;
  let pendingContribution = null;
  let toastTimer;
  let promptTimer;
  let promptDismissed = false;
  let contributionComplete = false;

  const apiConfigured = /^https:\/\//i.test(config.endpoint || '') &&
    typeof config.publishableKey === 'string' &&
    config.publishableKey.length > 10 &&
    !config.publishableKey.includes('YOUR_');

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function subjectName(key) {
    const subject = subjects.find(([subjectKey]) => subjectKey === key);
    return subject ? (language === 'en' ? subject[1] : subject[2]) : key;
  }

  function renderSubjects(preserveValues) {
    const previous = preserveValues
      ? [...subjectGrid.querySelectorAll('[data-subject-slot]')].map(trigger => trigger.dataset.subjectKey || '')
      : [];
    if (preserveValues) {
      subjectGrid.querySelectorAll('.mark-input').forEach(input => {
        if (input.name) marksBySubject[input.name] = input.value;
      });
    }

    subjectGrid.innerHTML = [0, 1, 2].map(index => {
      const selectedKey = previous[index] || '';
      const selectedName = selectedKey ? subjectName(selectedKey) : '';
      const slotName = copy[language].subjectSlot.replace('{n}', index + 1);
      const searchLabel = copy[language].searchSubjectLabel.replace('{n}', index + 1);
      const options = subjects.map(([key, en, si]) => {
        const name = language === 'en' ? en : si;
        const selected = key === selectedKey;
        return '<button class="subject-option' + (selected ? ' is-selected' : '') +
          '" type="button" role="option" data-subject-option="' + key +
          '" aria-selected="' + selected + '">' + escapeHtml(name) + '</button>';
      }).join('');
      const chosenText = selectedName || copy[language].chooseSubject;
      const inputValue = selectedKey ? (marksBySubject[selectedKey] ?? '') : '';
      return '<div class="subject-row"><div class="subject-picker">' +
        '<span class="subject-slot">' + escapeHtml(slotName) + '</span>' +
        '<button class="subject-select" id="subject-select-' + index +
        '" type="button" data-subject-slot="' + index + '" data-subject-key="' +
        escapeHtml(selectedKey) + '" aria-haspopup="listbox" aria-expanded="false" aria-controls="subject-menu-' +
        index + '" aria-label="' + escapeHtml(slotName + ': ' + chosenText) +
        '" aria-describedby="subject-note validation">' + escapeHtml(chosenText) +
        '<span class="select-chevron" aria-hidden="true">▾</span></button>' +
        '<div class="subject-menu" id="subject-menu-' + index + '" hidden>' +
        '<input class="subject-search" type="search" data-subject-search="' + index +
        '" autocomplete="off" value="' + escapeHtml(searchBySlot[index] || '') +
        '" placeholder="' + escapeHtml(copy[language].subjectSearchPlaceholder) +
        '" aria-label="' + escapeHtml(searchLabel) + '" aria-controls="subject-options-' + index + '">' +
        '<div class="subject-options" id="subject-options-' + index +
        '" role="listbox" aria-label="' + escapeHtml(slotName) + '">' + options + '</div></div></div>' +
        '<div class="mark-wrap"><label class="mark-label" for="mark-slot-' + index + '">' +
        escapeHtml(copy[language].rawMark) + '<span class="sr-only mark-subject">' +
        (selectedName ? ' ' + escapeHtml(selectedName) : '') + '</span></label>' +
        '<div class="mark-input-wrap"><input class="mark-input" id="mark-slot-' + index +
        '" name="' + escapeHtml(selectedKey) + '" type="number" min="0" max="100" step="1" ' +
        'inputmode="numeric" autocomplete="off" required placeholder="0–100…" ' +
        'aria-describedby="mark-instructions validation" value="' + escapeHtml(inputValue) + '"' +
        (selectedKey ? '' : ' disabled') + '><span class="out-of" aria-hidden="true">/ 100</span></div></div></div>';
    }).join('');

    subjectGrid.querySelectorAll('.mark-input').forEach(input => input.addEventListener('input', () => {
      if (input.name) marksBySubject[input.name] = input.value;
      input.removeAttribute('aria-invalid');
      validation.textContent = '';
      clearEstimate();
      renderCommunityStatus();
    }));

    subjectGrid.querySelectorAll('[data-subject-slot]').forEach(trigger => {
      const row = trigger.closest('.subject-row');
      const menu = row.querySelector('.subject-menu');
      const search = row.querySelector('[data-subject-search]');
      trigger.addEventListener('click', () => {
        const willOpen = menu.hidden;
        subjectGrid.querySelectorAll('.subject-menu').forEach(item => { item.hidden = true; });
        subjectGrid.querySelectorAll('[data-subject-slot]').forEach(item => item.setAttribute('aria-expanded', 'false'));
        menu.hidden = !willOpen;
        trigger.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) { search.focus(); filterSubjectOptions(trigger, search.value); }
      });
      trigger.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (menu.hidden) trigger.click();
          else search.focus();
        }
      });
      search.addEventListener('input', () => {
        searchBySlot[Number(search.dataset.subjectSearch)] = search.value;
        filterSubjectOptions(trigger, search.value);
      });
      search.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          menu.hidden = true;
          trigger.setAttribute('aria-expanded', 'false');
          trigger.focus();
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          row.querySelector('.subject-option:not([disabled]):not([hidden])')?.focus();
        }
      });
      row.querySelectorAll('[data-subject-option]').forEach(option => {
        option.addEventListener('click', () => selectSubject(trigger, option.dataset.subjectOption));
      });
    });
    updateSubjectOptionAvailability();
  }

  function updateSubjectOptionAvailability() {
    const triggers = [...subjectGrid.querySelectorAll('[data-subject-slot]')];
    triggers.forEach(trigger => {
      const chosenElsewhere = new Set(triggers.filter(other => other !== trigger)
        .map(other => other.dataset.subjectKey).filter(Boolean));
      trigger.closest('.subject-row').querySelectorAll('[data-subject-option]').forEach(option => {
        const disabled = chosenElsewhere.has(option.dataset.subjectOption);
        option.disabled = disabled;
        option.setAttribute('aria-disabled', String(disabled));
      });
    });
  }

  function filterSubjectOptions(trigger, queryText) {
    const query = queryText.trim().toLocaleLowerCase();
    trigger.closest('.subject-row').querySelectorAll('[data-subject-option]').forEach(option => {
      const subject = subjects.find(([key]) => key === option.dataset.subjectOption);
      option.hidden = !((subject[1] + ' ' + subject[2]).toLocaleLowerCase().includes(query));
    });
    updateSubjectOptionAvailability();
  }

  function selectSubject(trigger, newKey) {
    const row = trigger.closest('.subject-row');
    const subject = subjects.find(([key]) => key === newKey);
    if (!subject) return;
    const selectedName = language === 'en' ? subject[1] : subject[2];
    const mark = row.querySelector('.mark-input');
    if (mark.name) marksBySubject[mark.name] = mark.value;
    row.querySelectorAll('[data-subject-option]').forEach(option => {
      const selected = option.dataset.subjectOption === newKey;
      option.setAttribute('aria-selected', String(selected));
      option.classList.toggle('is-selected', selected);
    });
    trigger.dataset.subjectKey = newKey;
    trigger.setAttribute('aria-label', copy[language].subjectSlot
      .replace('{n}', Number(trigger.dataset.subjectSlot) + 1) + ': ' + selectedName);
    trigger.innerHTML = escapeHtml(selectedName) + '<span class="select-chevron" aria-hidden="true">▾</span>';
    mark.name = newKey;
    mark.disabled = false;
    mark.value = marksBySubject[newKey] ?? '';
    mark.removeAttribute('aria-invalid');
    row.querySelector('.mark-subject').textContent = ' ' + selectedName;
    row.querySelector('.subject-menu').hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    validation.textContent = '';
    clearEstimate();
    updateSubjectOptionAvailability();
    clearValidationWhenReady();
    renderCommunityStatus();
  }

  function translate() {
    document.documentElement.lang = language;
    document.title = copy[language].documentTitle;
    document.querySelectorAll('[data-i18n]').forEach(element => {
      element.textContent = copy[language][element.dataset.i18n];
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(element => {
      element.setAttribute('aria-label', copy[language][element.dataset.i18nAria]);
    });
    document.querySelectorAll('[data-lang]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.lang === language));
    });
    validation.textContent = '';
    renderSubjects(true);
    document.querySelector('#subject-note').textContent = copy[language].subjectNote;
    document.querySelector('.result-value').setAttribute('aria-label', copy[language].resultUnavailable);
    if (lastResult) renderEstimate(lastResult);
    renderCommunityStatus();
    clearValidationWhenReady();
  }

  function clearValidationWhenReady() {
    const inputs = [...subjectGrid.querySelectorAll('.mark-input')];
    const complete = inputs.length === 3 && inputs.every(input =>
      input.value !== '' && Number.isInteger(Number(input.value)) && Number(input.value) >= 0 && Number(input.value) <= 100);
    if (complete) validation.textContent = '';
  }

  function clearEstimate() {
    lastResult = null;
    hideContributionPrompt();
    document.querySelector('.result-title').textContent = copy[language].resultIdleTitle;
    document.querySelector('.result-value').textContent = '—';
    document.querySelector('.result-value').setAttribute('aria-label', copy[language].resultUnavailable);
    document.querySelector('.result-copy').textContent = copy[language].resultCopy;
    document.querySelector('#subject-results').innerHTML = '';
  }

  function selectedKeys() {
    return [...subjectGrid.querySelectorAll('[data-subject-slot]')]
      .map(trigger => trigger.dataset.subjectKey || '').filter(Boolean);
  }

  function renderCommunityStatus() {
    if (!apiConfigured) {
      communityStatus.textContent = copy[language].contributionNotConfigured;
      return;
    }
    if (communityState === 'loading') {
      communityStatus.textContent = copy[language].communityLoading;
      return;
    }
    if (communityState !== 'ready') {
      communityStatus.textContent = copy[language].communityUnavailable;
      return;
    }
    const keys = selectedKeys();
    if (keys.length !== 3) {
      communityStatus.textContent = copy[language].communitySelectSubjects;
      return;
    }
    const progress = keys.map(key => {
      const count = communityStats[key]?.contributionCount || 0;
      return copy[language].pendingSubject
        .replace('{subject}', subjectName(key))
        .replace('{count}', count);
    });
    communityStatus.textContent = progress.join(' · ');
  }

  function renderEstimate(result) {
    if (!result) return;
    const resultCopy = document.querySelector('.result-copy');
    const resultValue = document.querySelector('.result-value');
    const subjectResults = document.querySelector('#subject-results');
    const estimate = statsApi.calculate(result.selectedSubjects, result.marks, communityStats);
    if (estimate.status === 'pending') {
      const historical = calculateHistoricalEstimate(result.selectedSubjects, result.marks);
      if (historical) {
        const progress = result.selectedSubjects.map(key => copy[language].pendingSubject
          .replace('{subject}', subjectName(key))
          .replace('{count}', communityStats[key]?.contributionCount || 0)).join(' · ');
        document.querySelector('.result-title').textContent = copy[language].historicalTitle;
        resultCopy.textContent = copy[language].historicalCopy.replace('{subjects}', progress);
        resultValue.textContent = historical.overall.toFixed(3);
        resultValue.setAttribute('aria-label', copy[language].historicalTitle + ': ' + historical.overall.toFixed(3));
        subjectResults.innerHTML = historical.scores.map(item => '<div class="subject-result">' +
          escapeHtml(subjectName(item.key)) + '<strong>' + item.score.toFixed(3) + '</strong></div>').join('');
        return;
      }
    }
    document.querySelector('.result-title').textContent = copy[language].resultTitle;
    if (estimate.status === 'unavailable') {
      resultCopy.textContent = copy[language].communityNoSpread.replace('{subject}', subjectName(estimate.subjectKey));
      resultValue.textContent = '—';
      resultValue.setAttribute('aria-label', copy[language].resultUnavailable);
      subjectResults.innerHTML = '';
      return;
    }
    if (estimate.status !== 'ready') {
      const progress = (estimate.pending || []).map(item => copy[language].pendingSubject
        .replace('{subject}', subjectName(item.key))
        .replace('{count}', item.contributionCount));
      resultCopy.textContent = copy[language].communityPending.replace('{subjects}', progress.join(' · '));
      resultValue.textContent = '—';
      resultValue.setAttribute('aria-label', copy[language].resultUnavailable);
      subjectResults.innerHTML = '';
      return;
    }
    subjectResults.innerHTML = estimate.scores.map(item => {
      return '<div class="subject-result">' + escapeHtml(subjectName(item.key)) +
        '<strong>' + item.score.toFixed(3) + '</strong></div>';
    }).join('');
    resultCopy.textContent = copy[language].resultCopyReady;
    resultValue.textContent = estimate.overall.toFixed(3);
    resultValue.setAttribute('aria-label', copy[language].resultTitle + ': ' + estimate.overall.toFixed(3));
  }

  function calculateHistoricalEstimate(selectedSubjects, marks) {
    const scores = selectedSubjects.map((key, index) => {
      const stats = historicalStats[key];
      if (!Array.isArray(stats) || stats.length !== 6 || stats.some(value => !Number.isFinite(value))) return null;
      const yearly = [0, 1, 2].map(year => (Number(marks[index]) - stats[year]) / stats[year + 3]);
      return { key, score: yearly.reduce((sum, value) => sum + value, 0) / yearly.length };
    });
    if (scores.some(score => score === null)) return null;
    return { scores, overall: scores.reduce((sum, item) => sum + item.score, 0) / scores.length };
  }

  async function requestCommunity(path, options) {
    const response = await fetch(config.endpoint + path, {
      ...options,
      headers: {
        apikey: config.publishableKey,
        'Content-Type': 'application/json',
        ...(options?.headers || {})
      },
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || copy[language].communityUnavailable);
    return payload;
  }

  async function loadCommunityStats() {
    if (!apiConfigured) {
      communityState = 'not-configured';
      updateContributionAvailability();
      renderCommunityStatus();
      return;
    }
    communityState = 'loading';
    renderCommunityStatus();
    try {
      const payload = await requestCommunity('?v=' + Date.now(), { method: 'GET' });
      communityStats = statsApi.indexStats(payload.stats);
      communityState = 'ready';
      if (lastResult) {
        renderEstimate(lastResult);
        showContributionPrompt();
      }
    } catch {
      communityState = 'unavailable';
    }
    updateContributionAvailability();
    renderCommunityStatus();
  }

  function updateContributionAvailability() {
    contribute.disabled = !apiConfigured || communityState !== 'ready';
    contribute.closest('.contribution-opt-in').classList.toggle('is-disabled', contribute.disabled);
    if (contribute.disabled) contribute.checked = false;
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), 5000);
  }

  function hideContributionPrompt() {
    clearTimeout(promptTimer);
    contributionPrompt.hidden = true;
  }

  function showContributionPrompt() {
    if (promptDismissed || contributionComplete || !lastResult || document.querySelector('.result-value').textContent === '—' || !apiConfigured || communityState !== 'ready' || contribute.checked) return;
    clearTimeout(promptTimer);
    promptTimer = setTimeout(() => {
      if (!promptDismissed && !contributionComplete && lastResult && !contribute.checked) {
        contributionPrompt.hidden = false;
      }
    }, 1500);
  }

  async function sendContribution(selectedSubjects, marks) {
    const signature = JSON.stringify([selectedSubjects, marks]);
    if (!pendingContribution || pendingContribution.signature !== signature) {
      pendingContribution = { signature, submissionId: crypto.randomUUID() };
    }
    const payload = await requestCommunity('', {
      method: 'POST',
      body: JSON.stringify({
        submissionId: pendingContribution.submissionId,
        consent: true,
        website: '',
        marks: selectedSubjects.map((subjectKey, index) => ({ subjectKey, mark: marks[index] }))
      })
    });
    return payload.status;
  }

  languageButtons.forEach(button => button.addEventListener('click', () => {
    language = button.dataset.lang;
    translate();
  }));
  contribute.addEventListener('change', () => {
    if (contribute.checked) {
      hideContributionPrompt();
      contributionDialog.showModal();
    }
  });
  document.querySelector('#prompt-contribute').addEventListener('click', () => {
    if (contribute.disabled) return;
    contribute.checked = true;
    hideContributionPrompt();
    contributionDialog.showModal();
  });
  document.querySelector('#dismiss-contribution-prompt').addEventListener('click', () => {
    promptDismissed = true;
    hideContributionPrompt();
  });
  document.querySelector('#confirm-contribution').addEventListener('click', () => contributionDialog.close('confirm'));
  document.querySelector('#cancel-contribution').addEventListener('click', () => contributionDialog.close('private'));
  contributionDialog.addEventListener('close', () => {
    if (contributionDialog.returnValue !== 'confirm') {
      contribute.checked = false;
      showContributionPrompt();
    }
  });

  calculatorForm.addEventListener('submit', async event => {
    event.preventDefault();
    const selectors = [...subjectGrid.querySelectorAll('[data-subject-slot]')];
    const missingSubject = selectors.find(trigger => !trigger.dataset.subjectKey);
    if (missingSubject) {
      validation.textContent = copy[language].enterMarks;
      missingSubject.setAttribute('aria-invalid', 'true');
      missingSubject.focus();
      return;
    }
    const marks = [...subjectGrid.querySelectorAll('.mark-input')];
    const invalidMarks = marks.filter(input =>
      input.value === '' || !Number.isInteger(Number(input.value)) || Number(input.value) < 0 || Number(input.value) > 100);
    if (invalidMarks.length) {
      invalidMarks.forEach(input => input.setAttribute('aria-invalid', 'true'));
      validation.textContent = copy[language].enterMarks;
      invalidMarks[0].focus();
      return;
    }
    validation.textContent = '';
    const selectedSubjects = selectors.map(trigger => trigger.dataset.subjectKey);
    const markValues = marks.map(input => Number(input.value));
    lastResult = { selectedSubjects, marks: markValues };
    renderEstimate(lastResult);

    if (!contribute.checked) {
      showContributionPrompt();
      return;
    }
    hideContributionPrompt();
    const submitButton = calculatorForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    try {
      const status = await sendContribution(selectedSubjects, markValues);
      pendingContribution = null;
      contributionComplete = true;
      if (status === 'duplicate') showToast(copy[language].contributionDuplicate);
      else showToast(copy[language].contributionNotice);
      await loadCommunityStats();
      renderEstimate(lastResult);
    } catch {
      showToast(copy[language].contributionFailed);
    } finally {
      submitButton.disabled = false;
      contribute.checked = false;
      if (!contributionComplete) showContributionPrompt();
    }
  });

  renderSubjects();
  updateContributionAvailability();
  renderCommunityStatus();
  loadCommunityStats();
})();
