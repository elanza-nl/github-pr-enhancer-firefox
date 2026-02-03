(() => {
  if (window.location.hostname !== 'github.com') {
    return;
  }

  // PR一覧ページかどうかをチェックする関数
  function checkAndGetRepoInfo() {
    const pathname = window.location.pathname;
    const match = pathname.match(/^\/([^/]+)\/([^/]+)\/pulls/);
    if (!match) {
      return null;
    }
    return { owner: match[1], repo: match[2] };
  }

  // TODO: repoInfoをグローバル変数で管理するのをやめる
  let repoInfo = checkAndGetRepoInfo();
  let rowPromises = new WeakMap();
  const ROW_SELECTOR = '.js-issue-row';
  const SPAN_CLASS = 'github-show-reviewer';
  let currentUrl = window.location.href;
  let observer = null;

  // GitHub APIのヘッダーを取得（トークンがあれば含める）
  async function getApiHeaders() {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    // Chrome storageからトークンを取得
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

  // PR行の中に、レビュワー情報を表示するための<span>要素を作成して返す
  function ensureInfoSpan(row) {
    // row: PR行のDOM要素
    // メタ情報を含むコンテナを探す
    const metaContainer = row.querySelector('.d-flex.mt-1.text-small.color-fg-muted');
    if (!metaContainer) {
      return null;
    }

    // 既存の .d-none.d-md-inline-flex 要素を探す
    let inlineFlexContainer = metaContainer.querySelector('.d-none.d-md-inline-flex');
    if (!inlineFlexContainer) {
      // 無い場合は作成
      inlineFlexContainer = document.createElement('span');
      inlineFlexContainer.className = 'd-none d-md-inline-flex';
      metaContainer.appendChild(inlineFlexContainer);
    }

    // *********** 追加前 ***********
    // <span class="d-none d-md-inline-flex">
    //   <span class="d-inline-block ml-1">•Draft</span>
    //   <span class="issue-meta-section ml-2">...</span>
    // </span>
    // *****************************

    // SPAN_CLASS(.github-show-reviewer)というクラス名を持つ<span>要素を探す
    let reviewerSpan = inlineFlexContainer.querySelector(`.${SPAN_CLASS}`);
    // 以前の処理で挿入済みの場合はそのまま返す
    if (!reviewerSpan) {
      reviewerSpan = document.createElement('span');
      reviewerSpan.className = `${SPAN_CLASS} issue-meta-section ml-1`;
    }
    inlineFlexContainer.appendChild(reviewerSpan);

    // *********** 追加後 ***********
    // <span class="d-none d-md-inline-flex">
    //   <span class="d-inline-block ml-1">•Draft</span>
    //   <span class="issue-meta-section ml-2">...</span>
    //   <span class="github-show-reviewer issue-meta-section ml-2">...</span>
    // </span>
    // *****************************

    return reviewerSpan;
  }

  function extractPrNumber(row) {
    // row.idがissue_123のような形式であれば、123を返す
    if (row.id) {
      const byId = row.id.match(/issue_(\d+)/);
      if (byId) {
        return byId[1];
      }
    }

    // idからPR番号を抽出できなかった場合、リンクからPR番号を抽出
    const link = row.querySelector('a.Link--primary[href*="/pull/"]');
    if (link) {
      const match = link.getAttribute('href').match(/\/pull\/(\d+)/);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  function dedupe(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
      if (!seen.has(value)) {
        seen.add(value);
        result.push(value);
      }
    }
    return result;
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

  // <span>要素の中身を更新するためのユーティリティ関数
  // span: 基本的なグループ化タグ. 以下のようにインラインで部分的な装飾が可能
  // <p id="msg">Hello, <span id="name">World</span>!</p>
  // text: 表示したい文字列
  function setSpanText(span, text, isError = false, skipIcon = false) {
    // 目のアイコンを追加
    const iconSvg = `<svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" data-view-component="true" class="octicon octicon-eye">
           <path d="M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.62 1.62 0 0 1 0-1.798c.45-.677 1.367-1.931 2.637-3.022C4.33 2.992 6.019 2 8 2ZM1.679 7.932a.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 0 0 0-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.825.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z"></path>
         </svg>`;

    // span.innerHTML = `• ${text}`;
    span.innerHTML = skipIcon ? text : `${iconSvg}${text}`;

    // 成功状態
    // .github-show-reviewer--success(color: var(--fgColor-success, #1a7f37))
    span.classList.toggle(`${SPAN_CLASS}--success`, !isError);

    // isErrorがtrueの場合, エラースタイルを適用(style.cssで定義)
    // エラー状態：.github-show-reviewer--error(color: var(--fgColor-danger, #cf222e))
    span.classList.toggle(`${SPAN_CLASS}--error`, isError);
  }

  // Check if a user is a bot
  function isBot(login) {
    if (!login) return false;
    const lowerLogin = login.toLowerCase();
    return lowerLogin.endsWith('[bot]') ||
           lowerLogin.endsWith('-bot') ||
           lowerLogin.includes('bot-') ||
           lowerLogin === 'dependabot' ||
           lowerLogin === 'renovate' ||
           lowerLogin === 'github-actions';
  }

  // 以下のメソッドで使用されているAPIは以下
  // # 環境変数にトークンを設定
  // export GITHUB_TOKEN="your_github_token_here"

  // # PR詳細情報を取得
  // curl -H "Accept: application/vnd.github+json" \
  //     -H "X-GitHub-Api-Version: 2022-11-28" \
  //     -H "Authorization: Bearer $GITHUB_TOKEN" \ # if needed
  //     https://api.github.com/repos/{owner}/{repo}/pulls/{prNumber}

  // # レビュー情報を取得
  // curl -H "Accept: application/vnd.github+json" \
  //     -H "X-GitHub-Api-Version: 2022-11-28" \
  //     -H "Authorization: Bearer $GITHUB_TOKEN" \
  //     https://api.github.com/repos/{owner}/{repo}/pulls/{prNumber}/reviews
  async function fetchReviewers(prNumber) {
    const pullUrl = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/pulls/${prNumber}`;
    const reviewsUrl = `${pullUrl}/reviews`;

    try {
      console.log(`[GitHub Show Reviewer] Fetching PR #${prNumber}`);

      // 認証ヘッダーを取得
      const headers = await getApiHeaders();

      // Promise.all: 複数の非同期処理を並行して実行し、それらがすべて完了したら結果を配列で返す
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

      // レビュー中のユーザーを抽出（requested_reviewers: リクエストされたレビュワーの一覧）
      // レビューを完了するとrequested_reviewersは空になるので、後段でreviewsから抽出する
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

      // requested_teams: リクエストされたチームの一覧
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

      // レビュー済みのユーザーを抽出
      // PR画面にコメントを書いたユーザーを抽出する
      // そのままではPR作成者がコメントを書いた場合も反映されるので、作成者を除外する
      const reviewedUsers = Array.isArray(reviews)
        ? reviews
          .filter(
            (review) =>
              review &&
              review.user &&
              review.user.login &&
              review.state &&
              review.state.toUpperCase() !== 'PENDING' &&
              review.user.login !== pullData.user.login &&  // PR作成者を除外
              !isBot(review.user.login)  // ボットを除外
          )
          .map((review) => ({
            login: review.user.login,
            avatarUrl: review.user.avatar_url,
            type: 'reviewed',
            isTeam: false
          }))
        : [];
      console.log('reviewedUsers', reviewedUsers);

      // 重複を排除（loginで判定）
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
    // PR番号を抽出
    const prNumber = extractPrNumber(row);
    if (!prNumber) {
      return;
    }

    // PR行の中に, レビュワー情報を表示するための<span>要素を作成して返す
    const infoSpan = ensureInfoSpan(row);
    if (!infoSpan) {
      return;
    }

    // 既に処理中の場合はスキップ（重複リクエスト防止）
    if (rowPromises.has(row)) {
      return;
    }

    // レビュワー情報取得中の表示をセット
    setSpanText(infoSpan, '<span class="reviewer-separator">•</span><span>Reviewer: </span> Loading...', false, true);
    // title属性をクリア（エラー発生時のみ設定）
    infoSpan.removeAttribute('title');

    const promise = fetchReviewers(prNumber);
    rowPromises.set(row, promise);

    promise.then(({ reviewers, error }) => {
      if (rowPromises.get(row) !== promise) {
        return;
      }

      if (error) {
        setSpanText(infoSpan, '<span class="reviewer-separator">•</span><span>Reviewer: </span> <span class="reviewer-na">N/A</span>', true, true);
        infoSpan.title = error;
        return;
      }

      setSpanText(infoSpan, formatReviewerAvatars(reviewers), false, true);
      infoSpan.removeAttribute('title');
    });
    promise.finally(() => {
      if (rowPromises.get(row) === promise) {
        rowPromises.delete(row);
      }
    });
  }

  function processRows(root = document) {
    // DOMツリー内の検索対象範囲(root)から、ROW_SELECTORに一致する要素を検索
    const rows = root.querySelectorAll(ROW_SELECTOR);
    rows.forEach((row) => {
      updateRow(row);
    });
  }

  // 拡張機能を初期化する関数（URL変更時にも再実行される）
  function initializeExtension() {
    repoInfo = checkAndGetRepoInfo();

    // PR一覧ページでない場合は、Observerを停止して終了
    if (!repoInfo) {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      return;
    }

    rowPromises = new WeakMap();

    // MutationObserverを作成して監視開始
    if (!observer) {
      observer = new MutationObserver((mutations) => {
        // DOMの変更を検知したときの処理
        for (const mutation of mutations) {
          mutation.addedNodes.forEach((node) => {
            if (!(node instanceof HTMLElement)) {
              return;
            }
            // 追加されたノードがPR行の場合
            if (node.matches?.(ROW_SELECTOR)) {
              updateRow(node);
            }
            // 追加されたノードの子要素にPR行がある場合
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

    // 既存のPR行を処理
    processRows();
  }

  // URLの変更を監視（SPAナビゲーション対応）
  // GitHubは通常のページ遷移を行わないため、定期的にURLをチェック
  function checkUrlChange() {
    const newUrl = window.location.href;
    if (newUrl !== currentUrl) {
      currentUrl = newUrl;
      // DOMの更新を待ってから初期化
      setTimeout(() => {
        initializeExtension();
      }, 500);
    }
  }

  // 1秒ごとにURLの変更をチェック
  setInterval(checkUrlChange, 1000);

  // ブラウザの戻る/進むボタンにも対応
  window.addEventListener('popstate', () => {
    checkUrlChange();
  });

  // 初回実行
  initializeExtension();
})();
