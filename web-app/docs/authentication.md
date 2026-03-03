# Authentication System

## Overview
The application now includes a complete authentication system that protects all routes and API endpoints.

## Features
- **User Registration**: New users can create accounts with email and password
- **User Login**: Existing users can authenticate with their credentials  
- **JWT Token Authentication**: Secure session management using JWT tokens
- **Protected Routes**: All pages redirect to login if not authenticated
- **Protected API Endpoints**: All API routes return 401 if not authenticated
- **Logout Functionality**: Users can securely log out from the application

## How It Works

### Registration Flow
1. User navigates to `/auth/register`
2. Fills out registration form (email, password, first name, last name)
3. Password must be at least 8 characters
4. On submit, user is created in `/data/auth.json`
5. Password is hashed using bcrypt
6. User is redirected to login page

### Login Flow  
1. User navigates to `/auth/login`
2. Enters email and password
3. Credentials are verified against stored hash
4. JWT token is generated and stored in HTTP-only cookie
5. User is redirected to requested page or home

### Authentication Middleware
- All routes except public ones are protected
- Middleware verifies JWT token on every request
- Invalid or missing tokens redirect to login
- Tokens expire after 7 days

### Security Features
- Passwords hashed with bcrypt (10 rounds)
- JWT tokens signed with secret key
- HTTP-only cookies prevent XSS attacks
- Tokens expire after 7 days
- All API endpoints require valid authentication

## File Structure
```
/lib/auth/
  ├── file-auth.ts       # Main authentication logic
  └── jwt-edge.ts        # Edge-compatible JWT verification

/app/auth/
  ├── login/page.tsx     # Login page
  └── register/page.tsx  # Registration page

/app/api/auth/
  ├── login/route.ts     # Login API endpoint
  ├── register/route.ts  # Registration API endpoint  
  └── logout/route.ts    # Logout API endpoint

/data/
  └── auth.json         # User credentials storage

middleware.ts           # Route protection middleware
```

## Environment Variables
```env
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-123456789
```
**Important**: Change the JWT_SECRET in production!

## Testing
Test the authentication flow:
```bash
# Test registration
curl -X POST http://localhost:3244/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","firstName":"Test","lastName":"User"}'

# Test login
curl -X POST http://localhost:3244/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

## Production Considerations
1. **Change JWT_SECRET**: Use a strong, random secret in production
2. **Use HTTPS**: Always use HTTPS in production to protect tokens
3. **Consider rate limiting**: Add rate limiting to prevent brute force attacks
4. **Add password requirements**: Enforce stronger password policies
5. **Implement password reset**: Add forgot password functionality
6. **Add 2FA**: Consider two-factor authentication for enhanced security