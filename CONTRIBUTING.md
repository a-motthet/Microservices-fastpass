# Contributing to Parking Reservation System

Thank you for your interest in contributing to this project! 🎉

## Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/parking-reservation-system.git
   cd parking-reservation-system
   ```

2. **Install Dependencies**
   ```bash
   # Install common package dependencies
   cd packages/common && npm install
   
   # Install service dependencies
   cd ../../services/user-service && npm install
   cd ../user-car-service && npm install
   cd ../slot-service && npm install
   cd ../recently-service && npm install
   
   # Install API Gateway dependencies
   cd ../../api-gateway && npm install
   ```

3. **Setup Environment**
   - Copy `.env.example` to `.env` in each service
   - Configure Supabase credentials
   - Start RabbitMQ: `docker-compose up -d`

## Code Standards

### Architecture Principles

- **Hexagonal Architecture**: Keep domain logic separate from infrastructure
- **CQRS**: Separate command and query responsibilities
- **Event Sourcing**: All state changes must be recorded as events

### Code Style

- Use ES6+ features
- Follow existing code formatting
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

### Common Package Usage

All services must use shared utilities from `@parking-reservation/common`:

```javascript
import { 
  createLogger, 
  AppError, 
  errorHandler,
  RabbitMQAdapter,
  SupabaseEventStore 
} from '@parking-reservation/common';
```

### Logging

- Use `logger` instead of `console.log`
- Log levels: `info`, `warn`, `error`, `debug`
- Include service context in log messages

```javascript
const logger = createLogger('service-name');
logger.info('Operation completed successfully');
logger.error('Operation failed', error);
```

### Error Handling

- Throw `AppError` for application errors
- Include meaningful error messages
- Use appropriate HTTP status codes

```javascript
throw new AppError('Resource not found', 404);
```

## Commit Guidelines

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **refactor**: Code refactoring
- **test**: Adding tests
- **chore**: Maintenance tasks

### Examples

```
feat(user-service): add email validation

Implement email validation using regex pattern
to ensure valid email format before user creation.

Closes #123
```

```
fix(slot-service): resolve slot availability calculation

Fixed bug where reserved slots were counted as available
in capacity calculation.
```

## Pull Request Process

1. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**
   - Write clean, maintainable code
   - Follow existing patterns
   - Add comments where necessary

3. **Test Your Changes**
   - Ensure all services start without errors
   - Test the affected functionality manually
   - Verify event flow between services

4. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat(scope): description"
   ```

5. **Push to Your Fork**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request**
   - Provide a clear description of changes
   - Reference any related issues
   - Include screenshots for UI changes

## Testing

Currently, this project relies on manual testing:

1. Start all services
2. Test API endpoints using curl or Postman
3. Verify event propagation through RabbitMQ
4. Check database state in Supabase

**Future Goal**: Add automated unit and integration tests

## Questions?

Feel free to open an issue for:
- Bug reports
- Feature requests
- Questions about the architecture
- Clarifications on contribution process

Thank you for contributing! 🚀
