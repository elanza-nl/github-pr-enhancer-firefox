(() => {
  if (window.location.hostname !== 'github.com') {
    return;
  }

  // Check if current page is a PR list page and extract repo info
  function checkAndGetRepoInfo() {
    const pathname = window.location.pathname;
    const match = pathname.match(/^\/([^/]+)\/([^/]+)\/pulls/);
    if (!match) {
      return null;
    }
    return { owner: match[1], repo: match[2] };
  }

  let repoInfo = checkAndGetRepoInfo();
  let rowPromises = new WeakMap();
  const ROW_SELECTOR = '.js-issue-row';
  const SPAN_CLASS = 'github-show-reviewer';
  let currentUrl = window.location.href;
  let observer = null;

  // Get GitHub API headers (includes token if available)
  async function getApiHeaders() {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    try {
      const result = await chrome.storage.sync.get(['githubToken']);
      if (result.githubToken) {
        headers.Authorization = `Bearer ${result.githubToken}`;
      }
    } catch (error) {
      console.error('[GitHub Show Reviewer] Failed to get token from storage:', error);
    }

    return headers;
  }

  // Create and return span element for displaying reviewer info in PR row
  function ensureInfoSpan(row) {
    const metaContainer = row.querySelector('.d-flex.mt-1.text-small.color-fg-muted');
    if (!metaContainer) {
      return null;
    }

    let inlineFlexContainer = metaContainer.querySelector('.d-none.d-md-inline-flex');
    if (!inlineFlexContainer) {
      inlineFlexContainer = document.createElement('span');
      inlineFlexContainer.className = 'd-none d-md-inline-flex';
      metaContainer.appendChild(inlineFlexContainer);
    }

    // DOM structure before insertion:
    // <span class="d-none d-md-inline-flex">
    //   <span class="d-inline-block ml-1">•Draft</span>
    //   <span class="issue-meta-section ml-2">...</span>
    // </span>

    let reviewerSpan = inlineFlexContainer.querySelector(`.${SPAN_CLASS}`);
    if (!reviewerSpan) {
      reviewerSpan = document.createElement('span');
      reviewerSpan.className = `${SPAN_CLASS} issue-meta-section ml-1`;
    }
    inlineFlexContainer.appendChild(reviewerSpan);

    // DOM structure after insertion:
    // <span class="d-none d-md-inline-flex">
    //   <span class="d-inline-block ml-1">•Draft</span>
    //   <span class="issue-meta-section ml-2">...</span>
    //   <span class="github-show-reviewer issue-meta-section ml-1">...</span>
    // </span>

    return reviewerSpan;
  }

  function extractPrNumber(row) {
    // Try extracting from row.id (e.g., "issue_123" → "123")
    if (row.id) {
      const byId = row.id.match(/issue_(\d+)/);
      if (byId) {
        return byId[1];
      }
    }

    // Fallback: extract from PR link
    const link = row.querySelector('a.Link--primary[href*="/pull/"]');
    if (link) {
      const match = link.getAttribute('href').match(/\/pull\/(\d+)/);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  function formatReviewerAvatars(reviewers) {
    if (!reviewers || reviewers.length === 0) {
      return '<span class="reviewer-separator">•</span><span>Reviewer: </span> <span class="reviewer-none">None</span>';
    }

    const MAX_VISIBLE = 5;
    const visibleReviewers = reviewers.slice(0, MAX_VISIBLE);
    const overflowCount = reviewers.length - MAX_VISIBLE;

    const avatarElements = visibleReviewers.map((reviewer) => {
      if (reviewer.isTeam) {
        // Team icon with search URL
        const queryOperator = `team-review-requested:${repoInfo.owner}/${reviewer.login}`;
        const searchUrl = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/pulls?q=sort%3Aupdated-desc+is%3Apr+is%3Aopen+${encodeURIComponent(queryOperator)}`;
        const teamIcon = `<svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16" class="octicon octicon-people">
          <path d="M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 0 1 1-1.482.235 4 4 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 3.102 8.05 3.493 3.493 0 0 1 2 5.5ZM11 4a3.001 3.001 0 0 1 2.22 5.018 5.01 5.01 0 0 1 2.56 3.012.749.749 0 0 1-.885.954.752.752 0 0 1-.549-.514 3.507 3.507 0 0 0-2.522-2.372.75.75 0 0 1-.574-.73v-.352a.75.75 0 0 1 .416-.672A1.5 1.5 0 0 0 11 5.5.75.75 0 0 1 11 4Zm-5.5-.5a2 2 0 1 0-.001 3.999A2 2 0 0 0 5.5 3.5Z"></path>
        </svg>`;
        return `<a href="${searchUrl}" class="reviewer-team-badge" title="@${reviewer.login}" data-login="${reviewer.login}" data-is-team="true">
          ${teamIcon} <span class="team-name">@${reviewer.login}</span>
        </a>`;
      } else {
        // User avatar with search URL
        const queryOperator = `review-requested:${reviewer.login}`;
        const searchUrl = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/pulls?q=sort%3Aupdated-desc+is%3Apr+is%3Aopen+${encodeURIComponent(queryOperator)}`;
        const avatarUrl = reviewer.avatarUrl || `https://github.com/${reviewer.login}.png?size=40`;
        return `<a href="${searchUrl}" class="reviewer-avatar-link" data-login="${reviewer.login}" data-type="${reviewer.type}" title="${reviewer.login}">
          <img src="${avatarUrl}" alt="${reviewer.login}" class="reviewer-avatar" loading="lazy" />
        </a>`;
      }
    });

    let overflowBadge = '';
    if (overflowCount > 0) {
      overflowBadge = `<span class="reviewer-overflow-badge" title="${reviewers.slice(MAX_VISIBLE).map(r => r.isTeam ? '@' + r.login : r.login).join(', ')}">+${overflowCount}</span>`;
    }

    return `<span class="reviewer-separator">•</span><span class="reviewer-avatars-container">${avatarElements.join('')}${overflowBadge}</span>`;
  }

  // Update span element content with optional eye icon and error styling
  function setSpanText(span, text, isError = false) {
    span.innerHTML = text;
    span.classList.toggle(`${SPAN_CLASS}--success`, !isError);
    span.classList.toggle(`${SPAN_CLASS}--error`, isError);
  }

  // Check if a user is a bot
  function isBot(login) {
    if (!login) return false;
    const lowerLogin = login.toLowerCase();
    return lowerLogin.includes('bot') || lowerLogin === 'renovate' || lowerLogin === 'github-actions';
  }

  // Fetch reviewers from GitHub API
  // API endpoints:
  // - Pull request details: GET /repos/{owner}/{repo}/pulls/{prNumber}
  // - Pull request reviews: GET /repos/{owner}/{repo}/pulls/{prNumber}/reviews
  async function fetchReviewers(prNumber) {
    const pullUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${prNumber}`;
    const reviewsUrl = `${pullUrl}/reviews`;

    try {
      console.log(`[GitHub Show Reviewer] Fetching PR #${prNumber}`);

      const headers = await getApiHeaders();
      const [pullResponse, reviewsResponse] = await Promise.all([
        fetch(pullUrl, { headers }),
        fetch(reviewsUrl, { headers }),
      ]);

      if (!pullResponse.ok) {
        const errorText = await pullResponse.text();
        console.error(`[GitHub Show Reviewer] API Error:`, errorText);
        throw new Error(`GitHub API error ${pullResponse.status}: ${errorText.substring(0, 100)}`);
      }

      const pullData = await pullResponse.json();

      // Extract requested reviewers (excluding bots)
      const requestedUsers = Array.isArray(pullData.requested_reviewers)
        ? pullData.requested_reviewers
            .filter((user) => !isBot(user.login))
            .map((user) => ({
              login: user.login,
              avatarUrl: user.avatar_url,
              type: 'requested',
              isTeam: false
            }))
        : [];

      // Extract requested teams
      const requestedTeams = Array.isArray(pullData.requested_teams)
        ? pullData.requested_teams.map((team) => ({
            login: team.slug,
            type: 'requested',
            isTeam: true
          }))
        : [];

      let reviews = [];
      if (reviewsResponse.ok) {
        reviews = await reviewsResponse.json();
      }

      // Extract users who have reviewed (exclude PR author and bots)
      const reviewedUsers = Array.isArray(reviews)
        ? reviews
          .filter(
            (review) =>
              review &&
              review.user &&
              review.user.login &&
              review.state &&
              review.state.toUpperCase() !== 'PENDING' &&
              review.user.login !== pullData.user.login &&
              !isBot(review.user.login)
          )
          .map((review) => ({
            login: review.user.login,
            avatarUrl: review.user.avatar_url,
            type: 'reviewed',
            isTeam: false
          }))
        : [];
      console.log('reviewedUsers', reviewedUsers);

      // Deduplicate by login
      const allReviewers = [...requestedUsers, ...requestedTeams, ...reviewedUsers];
      const seenLogins = new Set();
      const reviewers = [];
      for (const reviewer of allReviewers) {
        const key = reviewer.isTeam ? `@${reviewer.login}` : reviewer.login;
        if (!seenLogins.has(key)) {
          seenLogins.add(key);
          reviewers.push(reviewer);
        }
      }

      return { reviewers };
    } catch (error) {
      return { error: error.message || 'Unknown error' };
    }
  }

  function updateRow(row) {
    const prNumber = extractPrNumber(row);
    if (!prNumber) {
      return;
    }

    const infoSpan = ensureInfoSpan(row);
    if (!infoSpan) {
      return;
    }

    // Skip if already processing (prevent duplicate requests)
    if (rowPromises.has(row)) {
      return;
    }

    setSpanText(infoSpan, '<span class="reviewer-separator">•</span><span>Reviewer: </span> Loading...', false);
    infoSpan.removeAttribute('title');

    const promise = fetchReviewers(prNumber);
    rowPromises.set(row, promise);

    promise.then(({ reviewers, error }) => {
      if (rowPromises.get(row) !== promise) {
        return;
      }

      if (error) {
        setSpanText(infoSpan, '<span class="reviewer-separator">•</span><span>Reviewer: </span> <span class="reviewer-na">N/A</span>', true);
        infoSpan.title = error;
        return;
      }

      setSpanText(infoSpan, formatReviewerAvatars(reviewers), false);
      infoSpan.removeAttribute('title');
    });
    promise.finally(() => {
      if (rowPromises.get(row) === promise) {
        rowPromises.delete(row);
      }
    });
  }

  function processRows(root = document) {
    const rows = root.querySelectorAll(ROW_SELECTOR);
    rows.forEach((row) => {
      updateRow(row);
    });
  }

  // Initialize extension (re-run when URL changes)
  function initializeExtension() {
    repoInfo = checkAndGetRepoInfo();

    if (!repoInfo) {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      return;
    }

    rowPromises = new WeakMap();

    if (!observer) {
      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          mutation.addedNodes.forEach((node) => {
            if (!(node instanceof HTMLElement)) {
              return;
            }
            if (node.matches?.(ROW_SELECTOR)) {
              updateRow(node);
            }
            const nestedRows = node.querySelectorAll?.(ROW_SELECTOR);
            if (nestedRows && nestedRows.length > 0) {
              nestedRows.forEach((row) => {
                updateRow(row);
              });
            }
          });
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    processRows();
  }

  // Monitor URL changes (for SPA navigation)
  function checkUrlChange() {
    const newUrl = window.location.href;
    if (newUrl !== currentUrl) {
      currentUrl = newUrl;
      setTimeout(() => {
        initializeExtension();
      }, 500);
    }
  }

  setInterval(checkUrlChange, 1000);

  window.addEventListener('popstate', () => {
    checkUrlChange();
  });

  initializeExtension();
})();
