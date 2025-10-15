# Security Utils

Security and path validation utilities for the move-file generator.

## Purpose

This module provides critical security functions to protect against path traversal attacks, regex denial-of-service (ReDoS), and other security vulnerabilities. All user-supplied paths and patterns are validated and sanitized through these functions.

## Functions

- **sanitize-path.ts** - Sanitize and normalize file paths to prevent traversal attacks
- **escape-regex.ts** - Escape regex-special characters to prevent ReDoS attacks
- **is-valid-path-input.ts** - Validate path input for security and format requirements

## Usage

```typescript
import { sanitizePath } from './security-utils/sanitize-path';
import { escapeRegex } from './security-utils/escape-regex';
import { isValidPathInput } from './security-utils/is-valid-path-input';

// Sanitize user-supplied path
const safePath = sanitizePath('/path/to/file.ts', { allowUnicode: false });
// Returns normalized path or throws error on invalid input

// Escape regex special characters
const safePattern = escapeRegex('component.*.ts');
// Returns escaped pattern safe for use in RegExp

// Validate path input
const isValid = isValidPathInput('/valid/path.ts', { allowUnicode: false });
// Returns true if path is valid, false otherwise
```

## Security Features

### Path Sanitization

Protects against:

- **Directory traversal**: Blocks `../`, `..\\`, etc.
- **Absolute path injection**: Validates expected path format
- **Null bytes**: Removes `\0` characters
- **Hidden files**: Optionally blocks `.` prefixed paths
- **Special characters**: Validates character set

### Regex Escaping

Protects against:

- **ReDoS attacks**: Escapes `*`, `+`, `?`, `{`, `}`, etc.
- **Backtracking**: Prevents exponential regex execution time
- **Injection**: Ensures user input can't modify regex behavior

### Input Validation

Validates:

- **Unicode characters**: Optional `allowUnicode` flag
- **Path format**: Checks for valid path structure
- **Reserved characters**: Blocks dangerous characters
- **Length limits**: Prevents excessively long paths

## Security Policy

All user inputs MUST go through these functions:

1. **File paths**: Use `sanitizePath()` before any file operations
2. **Glob patterns**: Use `escapeRegex()` for dynamic patterns
3. **Import paths**: Validate with `isValidPathInput()` first

## Error Messages

Security functions provide clear error messages:

- `Invalid path: contains directory traversal`
- `Invalid path: contains null bytes`
- `Invalid path: contains Unicode characters (use --allow-unicode to permit)`
- `Path too long: maximum 1000 characters`

## Testing

All security functions have comprehensive unit tests covering:

- Valid inputs (various formats, edge cases)
- Invalid inputs (traversal attempts, special chars)
- Unicode handling (with and without allowUnicode flag)
- Regex escaping (all special characters)
- Edge cases (empty strings, null, undefined)

Total: Tests included in the security-utils test suite

## Best Practices

1. **Always sanitize first**: Never use raw user input
2. **Fail securely**: Throw errors rather than silently accepting bad input
3. **Log suspicious activity**: Track traversal attempts
4. **Document assumptions**: Comment why security checks exist
5. **Test edge cases**: Cover all attack vectors

## Related

- [Validation](../validation/README.md) - Uses security utils for path validation
- [Path Utils](../path-utils/README.md) - Works with sanitized paths
- [Constants](../constants/README.md) - Defines allowed file extensions
