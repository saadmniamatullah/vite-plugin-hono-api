#!/bin/bash
# Test NPM Token Authentication
# This script helps verify if your NPM token is valid

echo "🔍 NPM Token Authentication Test"
echo "=================================="
echo ""

# Check if NPM_TOKEN is set
if [ -z "$NPM_TOKEN" ]; then
    echo "❌ Error: NPM_TOKEN environment variable is not set"
    echo ""
    echo "To test your token, run:"
    echo "  export NPM_TOKEN='npm_your_token_here'"
    echo "  bash test-npm-token.sh"
    exit 1
fi

echo "✅ NPM_TOKEN is set (length: ${#NPM_TOKEN} characters)"
echo ""

# Create a temporary .npmrc file
TEMP_NPMRC=$(mktemp)
echo "//registry.npmjs.org/:_authToken=\${NPM_TOKEN}" > "$TEMP_NPMRC"

echo "📝 Created temporary .npmrc at: $TEMP_NPMRC"
echo ""

# Test 1: Check whoami
echo "Test 1: Running 'npm whoami' with token..."
NPM_CONFIG_USERCONFIG="$TEMP_NPMRC" npm whoami 2>&1
WHOAMI_EXIT=$?

if [ $WHOAMI_EXIT -eq 0 ]; then
    echo "✅ Authentication successful!"
else
    echo "❌ Authentication failed (exit code: $WHOAMI_EXIT)"
    echo ""
    echo "This means your token is invalid or has issues."
fi

echo ""
echo "Test 2: Checking token format..."

# Check if token starts with npm_
if [[ $NPM_TOKEN == npm_* ]]; then
    echo "✅ Token starts with 'npm_' (correct format)"
else
    echo "❌ Token doesn't start with 'npm_' (unexpected format)"
    echo "   Modern npm tokens should start with 'npm_'"
fi

# Check token length (typical automation tokens are ~72+ chars)
if [ ${#NPM_TOKEN} -ge 72 ]; then
    echo "✅ Token length is adequate (${#NPM_TOKEN} chars)"
else
    echo "⚠️  Token seems short (${#NPM_TOKEN} chars) - might be incomplete"
fi

echo ""
echo "Test 3: Checking registry access..."
NPM_CONFIG_USERCONFIG="$TEMP_NPMRC" npm ping 2>&1
PING_EXIT=$?

if [ $PING_EXIT -eq 0 ]; then
    echo "✅ Registry is reachable"
else
    echo "❌ Cannot reach registry"
fi

# Cleanup
rm -f "$TEMP_NPMRC"

echo ""
echo "=================================="
echo "🏁 Test Complete"
echo ""

if [ $WHOAMI_EXIT -eq 0 ]; then
    echo "✅ Your token is working correctly!"
    echo ""
    echo "Next steps:"
    echo "1. Make sure the GitHub secret NPM_TOKEN contains this exact token"
    echo "2. Re-run your GitHub Actions workflow"
else
    echo "❌ Your token has authentication issues"
    echo ""
    echo "Possible causes:"
    echo "1. Token was revoked or expired"
    echo "2. Token type is wrong (need Automation token)"
    echo "3. 2FA setting is wrong (need 'Authorization only')"
    echo "4. Token wasn't copied completely"
    echo ""
    echo "Recommended action: Create a fresh Automation token on npm"
fi

