#!/bin/bash

# claude-qc.sh - Fully automated PR QC setup
# Pulls latest PRs and sets up Claude Code to QC them automatically

set -e

# Check we're in a git repo
if [ ! -d ".git" ]; then
    echo "❌ Not in a git repository"
    exit 1
fi

# Check dependencies
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) not found"
    exit 1
fi

# Get repo info
REPO_NAME=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || {
    echo "❌ Could not detect GitHub repository"
    exit 1
})

# Store original branch
ORIGINAL_BRANCH=$(git branch --show-current)

# Fetch latest PRs
PR_DATA=$(gh pr list --state open --limit 5 --json number,title,author,headRefName,additions,deletions,url)
PR_COUNT=$(echo "$PR_DATA" | jq length)

if [ "$PR_COUNT" -eq 0 ]; then
    echo "No open PRs found"
    exit 0
fi

# Get the most recently updated PR
LATEST_PR=$(echo "$PR_DATA" | jq -r '.[0].number')
PR_TITLE=$(echo "$PR_DATA" | jq -r '.[0].title')
PR_AUTHOR=$(echo "$PR_DATA" | jq -r '.[0].author.login')
PR_BRANCH=$(echo "$PR_DATA" | jq -r '.[0].headRefName')
PR_CHANGES=$(echo "$PR_DATA" | jq -r '.[0].additions + [0] | add')
PR_DELETIONS=$(echo "$PR_DATA" | jq -r '.[0].deletions + [0] | add')

echo "🔍 Auto-QC for PR #$LATEST_PR: $PR_TITLE"

# Checkout the PR
gh pr checkout "$LATEST_PR"

# Get changed files
CHANGED_FILES=$(gh pr diff "$LATEST_PR" --name-only | tr '\n' ' ')

# Create comprehensive QC instructions for Claude
cat > CLAUDE_QC_TASK.md << EOF
# 🤖 AUTOMATED QC TASK

## CURRENT ASSIGNMENT
**YOU ARE NOW THE QC AGENT** for this repository. A new PR has been automatically pulled down for your review.

## PR DETAILS
- **PR #$LATEST_PR:** $PR_TITLE
- **Author:** $PR_AUTHOR  
- **Branch:** $PR_BRANCH
- **Changes:** +$PR_CHANGES -$PR_DELETIONS lines
- **Status:** READY FOR IMMEDIATE QC REVIEW

## CHANGED FILES TO REVIEW:
$CHANGED_FILES

## YOUR QC PROCESS (Execute Automatically)

### 1. SECURITY SCAN
- Scan all changed files for security vulnerabilities
- Look for: exposed secrets, SQL injection, XSS, authentication bypass
- Check for hardcoded passwords, API keys, or sensitive data
- Verify input validation and sanitization

### 2. CODE QUALITY REVIEW  
- Check coding standards and best practices
- Review error handling and edge cases
- Verify proper logging and monitoring
- Assess code maintainability and readability
- Look for code smells, duplicated code, or technical debt

### 3. BROWSER TESTING (Use browser-mcp)
**CRITICAL:** Use your browser tools to test this PR:

1. **Navigate to the running application**:
   - Go to the local development server (already running)
   - Typically http://localhost:5173 or http://localhost:8000

2. **Test the new functionality**:
   - Use browser_navigate to go to relevant pages
   - Use browser_click, browser_type to interact with new features
   - Take browser_screenshot to document any issues
   - Test user workflows end-to-end

3. **Test edge cases**:
   - Invalid inputs
   - Error scenarios  
   - Responsive design (mobile/desktop)
   - Accessibility features

### 4. AUTOMATED REPORTING
Generate a comprehensive QC report with this structure:

\`\`\`markdown
# QC REPORT: PR #$LATEST_PR

## EXECUTIVE SUMMARY
[Brief overview and recommendation]

## SECURITY ANALYSIS
- [ ] No exposed secrets or credentials
- [ ] Input validation implemented
- [ ] No injection vulnerabilities  
- [ ] Authentication/authorization secure
[List any security issues found]

## CODE QUALITY ASSESSMENT
- [ ] Follows coding standards
- [ ] Proper error handling
- [ ] Adequate test coverage
- [ ] Documentation updated
[List quality issues]

## BROWSER TESTING RESULTS
- [ ] New features work correctly
- [ ] No regressions in existing functionality
- [ ] Responsive design maintained
- [ ] Error handling works properly
[Document testing results with screenshots if needed]

## ISSUES FOUND

### 🔴 CRITICAL (Must Fix Before Merge)
[Blocking issues]

### 🟡 HIGH (Should Fix)  
[Important but not blocking]

### 🔵 MEDIUM/LOW (Optional)
[Nice to have improvements]

## FINAL RECOMMENDATION
- [ ] ✅ APPROVE - Ready to merge
- [ ] 🔄 REQUEST CHANGES - Fix issues listed above  
- [ ] ❌ REJECT - Major problems requiring rework

## NEXT STEPS FOR DEVELOPER
[Specific actionable feedback]
\`\`\`

## YOUR IMMEDIATE ACTIONS
1. **Start your QC review NOW** - don't wait for further instructions
2. **Use browser-mcp extensively** to test the application
3. **Be thorough** - this is production code review
4. **Provide specific, actionable feedback**
5. **Document everything** with evidence (screenshots, code snippets)

## DEVELOPMENT SERVER INFO
The local development server is already running.
Common URLs:
- http://localhost:5173 (React/Node.js)
- http://localhost:3000 (Django/Python)
- Check the application's README or configuration for the exact URL

## BROWSER TESTING CHECKLIST
- [ ] Application loads without errors
- [ ] New features work as described in PR
- [ ] No console errors or warnings
- [ ] Forms submit correctly
- [ ] Navigation works properly
- [ ] Responsive design maintained
- [ ] Error states handled gracefully

**STATUS: 🟢 READY FOR QC - BEGIN REVIEW IMMEDIATELY**

---
*Auto-generated on $(date) | Original branch: $ORIGINAL_BRANCH*
EOF

# Create a status file for tracking
cat > QC_STATUS.md << EOF
# QC AUTOMATION STATUS

**Last Run:** $(date)
**Repository:** $REPO_NAME
**PR Under Review:** #$LATEST_PR - $PR_TITLE
**Author:** $PR_AUTHOR
**Original Branch:** $ORIGINAL_BRANCH

## CURRENT STATE
- ✅ PR checked out and ready
- ✅ Claude instructions generated  
- ⏳ Waiting for Claude QC review

## TO RETURN TO ORIGINAL BRANCH
\`git checkout $ORIGINAL_BRANCH\`

## REFRESH QC QUEUE
\`./claude-qc.sh\`
EOF

echo "✅ QC setup complete!"
echo "📋 PR #$LATEST_PR checked out and ready for review"
echo "🤖 Claude QC instructions written to CLAUDE_QC_TASK.md"
echo ""
echo "💡 Open Claude Code now - it will automatically start QC review"
echo "🔄 To return to $ORIGINAL_BRANCH: git checkout $ORIGINAL_BRANCH"
