#!/bin/bash
# Backend API Test Script

# Configuration
API_URL="${API_URL:-$(cd ../infra && terraform output -raw api_gateway_url 2>/dev/null)}"
NEXTAUTH_SECRET="Eimrfhv3ACYOtLtel2QcP7A6Hx/YPjBHIGBZwtE8XIU="

if [ -z "$API_URL" ]; then
    echo "Error: Could not get API_URL. Set it manually:"
    echo "  export API_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/dev"
    exit 1
fi

echo "API URL: $API_URL"
echo ""

# Generate a test JWT token
generate_token() {
    node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { 
    user: { id: 'test-user-1', email: 'admin@test.com', role: 'admin' },
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  }, 
  '$NEXTAUTH_SECRET'
);
console.log(token);
"
}

TOKEN=$(generate_token)
echo "Generated test token"
echo ""

# Test 1: Health check (no auth)
echo "=== Test 1: Health Check (no auth) ==="
curl -s -X GET "$API_URL/health" | jq .
echo ""

# Test 2: List users (with auth)
echo "=== Test 2: List Users (with auth) ==="
curl -s -X GET "$API_URL/users" \
  -H "Authorization: Bearer $TOKEN" | jq .
echo ""

# Test 3: Create user
echo "=== Test 3: Create User ==="
CREATE_RESPONSE=$(curl -s -X POST "$API_URL/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "firstName": "Test",
    "lastName": "User",
    "role": "viewer",
    "department": "Engineering"
  }')
echo "$CREATE_RESPONSE" | jq .
USER_ID=$(echo "$CREATE_RESPONSE" | jq -r '.id // .user.id // empty')
echo ""

if [ -n "$USER_ID" ]; then
    # Test 4: Get user by ID
    echo "=== Test 4: Get User by ID ($USER_ID) ==="
    curl -s -X GET "$API_URL/users/$USER_ID" \
      -H "Authorization: Bearer $TOKEN" | jq .
    echo ""

    # Test 5: Update user
    echo "=== Test 5: Update User ==="
    curl -s -X PUT "$API_URL/users/$USER_ID" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{
        "firstName": "Updated",
        "lastName": "Name"
      }' | jq .
    echo ""

    # Test 6: Delete user
    echo "=== Test 6: Delete User ==="
    curl -s -X DELETE "$API_URL/users/$USER_ID" \
      -H "Authorization: Bearer $TOKEN" | jq .
    echo ""
fi

# Test 7: Unauthorized request (no token)
echo "=== Test 7: Unauthorized Request (no token) ==="
curl -s -X GET "$API_URL/users" | jq .
echo ""

echo "=== Tests Complete ==="
