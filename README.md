# GitHub PR Enchancer

A Firefox extension that displays reviewers directly in the GitHub Pull Request list view.

## Features

- Display reviewer avatars and review status
- Click on a reviewer/team reviewer to filter PRs by that assignee

![Show Reviewer](docs/github_show_reviewer.gif)

## Installation

**For Developers (Temporary Installation):**

1. Clone this repository
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file from the extension directory

**Note:** Temporary add-ons are removed when Firefox restarts. For permanent installation, use Firefox Developer Edition/Nightly or wait for the official AMO release.

**For Permanent Self-Hosting:**

1. Package the extension: `zip -r github-pr-enhancer.xpi *` (from extension directory)
2. Submit to [addons.mozilla.org](https://addons.mozilla.org/developers/) as "unlisted" for Mozilla signing
3. Download the signed `.xpi` and install via `about:addons` → Install Add-on From File

## Configuration

For private repositories or to increase API rate limits, you need to configure your GitHub Personal Access Token.

1. Open Firefox and navigate to `about:addons`
2. Find "GitHub PR Enhancer" and click on it
3. Click the "Options" or "Preferences" tab
4. The GitHub PR Enhancer Settings page will open as shown below

![Settings Page](docs/github_access_token_setting.png)

5. Click "Create a token here" link
6. GitHub's fine-grained token creation page will open
7. Give the token a name, select the repositories it will be used on, and under Permissions set `Pull requests` to `Read`
8. Generate the token and copy it
9. Paste the token in the input field and click "Save"
