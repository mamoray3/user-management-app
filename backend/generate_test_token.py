#!/usr/bin/env python3
"""
Generate a test JWT token for Postman testing.
Run this locally to get a token you can use in Postman.
"""
import jwt
import os
from datetime import datetime, timedelta

# Use the same secret as configured in terraform.tfvars
# Default secret for testing - change this to match your NEXTAUTH_SECRET
SECRET = os.environ.get('NEXTAUTH_SECRET', 'your-super-secret-key-change-in-production-min-32-chars')

def generate_token():
    payload = {
        'sub': 'test-user-id',
        'email': 'admin@example.com',
        'name': 'Test Admin',
        'role': 'admin',
        'groups': ['Admins'],
        'iat': datetime.utcnow(),
        'exp': datetime.utcnow() + timedelta(hours=24),
        'iss': 'test-issuer'
    }
    
    token = jwt.encode(payload, SECRET, algorithm='HS256')
    return token

if __name__ == '__main__':
    token = generate_token()
    print("\n" + "="*60)
    print("TEST JWT TOKEN FOR POSTMAN")
    print("="*60)
    print(f"\nBearer {token}")
    print("\n" + "="*60)
    print("\nUse this in Postman:")
    print("1. Go to Authorization tab")
    print("2. Select 'Bearer Token' type")
    print("3. Paste the token (without 'Bearer ' prefix)")
    print("="*60 + "\n")
