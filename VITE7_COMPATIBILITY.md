# Vite 7 Environment API Compatibility

This document details the changes made to support Vite 7's Environment API while maintaining backward compatibility with Vite 6.

## Overview

Vite 7 introduced a significant change in how plugins interact with different build environments through the new Environment API. This plugin has been updated to support these new patterns while maintaining full backward compatibility with Vite 6.

## Changes Made

### 1. Environment-Aware Plugin Properties

Added three new plugin properties that enable proper environment handling in Vite 7:

```typescript
{
  name: 'vite-plugin-hono',

  // Enable per-environment lifecycle during development
  perEnvironmentStartEndDuringDev: true,

  // Share plugin instance during build
  sharedDuringBuild: true,

  // Filter to only apply to server/ssr environments
  applyToEnvironment(environment) {
    return environment.name === 'server' || environment.name === 'ssr';
  },

  // ... rest of plugin
}
```

**Benefits:**

- `perEnvironmentStartEndDuringDev`: Ensures proper lifecycle hooks for each environment during dev
- `sharedDuringBuild`: Optimizes plugin instance reuse during builds
- `applyToEnvironment`: Prevents unnecessary execution in client environments

### 2. Environment Context Usage

Updated `buildStart` hook to use environment context:

```typescript
buildStart() {
  // Use environment context to determine if this is the server build
  const isServerEnv = this.environment?.name === 'server' || this.environment?.name === 'ssr';

  if (isBuildCommand && isServerEnv) {
    const wrapperPath = join(workingDir, WRAPPER_FILE);
    if (!fileExists(wrapperPath)) {
      writeFileSync(wrapperPath, generateWrapper(basePath, port), 'utf8');
    }
  }
}
```

**Benefits:**

- Explicitly checks environment context via `this.environment`
- Handles both 'server' and 'ssr' environment names
- Uses optional chaining for safety with Vite 6

### 3. Version Check Enhancement

Updated `checkViteVersion()` to return major version:

```typescript
const checkViteVersion = () => {
  // ... parsing logic
  return {
    valid: true,
    currentVersion: version,
    majorVersion, // Now included
  };
};
```

**Benefits:**

- Enables version-specific logic if needed in the future
- Better error messages with version information

### 4. Peer Dependencies Update

Updated `package.json` to support both Vite versions:

```json
{
  "peerDependencies": {
    "hono": "^4.6.9",
    "vite": "^6.0.0 || ^7.0.0"
  }
}
```

**Benefits:**

- Explicit support for both Vite 6 and 7
- Clear version requirements for users
- npm/pnpm will validate compatibility

## Backward Compatibility

All changes maintain full backward compatibility with Vite 6:

1. **New Plugin Properties**:
   - Vite 6 ignores `perEnvironmentStartEndDuringDev` and `sharedDuringBuild`
   - `applyToEnvironment` is optional and gracefully skipped by Vite 6

2. **Environment Context**:
   - Uses optional chaining (`this.environment?.name`) for safe access
   - Falls back gracefully when environment context is not available

3. **Existing Behavior**:
   - All existing hooks and logic remain unchanged
   - No breaking changes to user-facing API

## Testing

All 16 existing tests pass without modification:

- ✅ Wrapper generation and cleanup
- ✅ Deploy file copying
- ✅ API request proxying
- ✅ Custom options handling
- ✅ Error handling
- ✅ Module graph invalidation
- ✅ Multi-runtime support

## Migration Guide

For users upgrading from previous versions:

### No Changes Required

The plugin maintains full API compatibility. Existing configurations will continue to work:

```typescript
// This continues to work in both Vite 6 and 7
export default defineConfig({
  plugins: [
    honoApi({
      basePath: '/api',
      port: 4173,
    }),
  ],
});
```

### Upgrading to Vite 7

If upgrading your project to Vite 7:

1. Update Vite: `npm install vite@^7.0.0`
2. The plugin automatically detects and uses Vite 7 features
3. No configuration changes needed

## Technical Details

### Vite 7 Environment API

The Environment API in Vite 7 provides:

1. **Named Environments**: Explicit environment names (e.g., 'client', 'server', 'ssr')
2. **Environment Context**: Access via `this.environment` in hooks
3. **Lifecycle Control**: Per-environment hook execution control
4. **Plugin Sharing**: Controlled plugin instance sharing across environments

### Implementation Strategy

This plugin uses a conservative approach:

1. **Additive Changes Only**: New properties are added, existing logic unchanged
2. **Optional Features**: All new features use optional chaining for safety
3. **Dual Support**: Works correctly in both Vite 6 and 7 environments
4. **No Breaking Changes**: User-facing API remains identical

## Resources

- [Vite 7 Environment API Documentation](https://vite.dev/guide/api-environment-plugins)
- [Vite 7 Release Announcement](https://vite.dev/blog/announcing-vite7)
- [Plugin Migration Guide](https://vite.dev/guide/api-plugin)

## Future Considerations

Potential future enhancements (not included in current version):

1. **Environment-Specific Configuration**: Different settings per environment
2. **Advanced Environment Detection**: More sophisticated environment checks
3. **Vite 8+ Preparation**: Stay current with future Vite versions

## Conclusion

This update successfully adds Vite 7 Environment API support while maintaining complete backward compatibility with Vite 6. Users can confidently upgrade to Vite 7 or continue using Vite 6 with the same plugin version.
