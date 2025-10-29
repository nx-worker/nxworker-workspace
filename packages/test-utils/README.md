# @nxworker/test-utils

Test utilities for nxworker packages.

## Features

- `uniqueId(prefix?)`: Generate globally unique IDs using cryptographically random bytes
  - Uses `randomBytes` from Node.js `crypto` module
  - Generates 16-character hexadecimal strings (8 random bytes)
  - Optionally accepts a prefix to prepend to the ID
  - Ensures uniqueness across test runs and parallel processes

## Usage

```typescript
import { uniqueId } from '@nxworker/test-utils';

// Generate unique ID without prefix
const id = uniqueId(); // => 'a1b2c3d4e5f6a7b8'

// Generate unique ID with prefix
const libName = uniqueId('lib-'); // => 'lib-a1b2c3d4e5f6a7b8'
```

## Why this package?

This package provides a globally unique ID function that replaces lodash's `uniqueId`. Unlike lodash's counter-based implementation, this ensures true global uniqueness using cryptographically random bytes, preventing ID collisions in automated tests, parallel test runs, and benchmarks.
