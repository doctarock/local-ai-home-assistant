# Changelog

## 2026-04-29 1.2.0

### Added
- Added Home Assistant / IoT support with secure instance registry and token handling.
- Added worker tool integrations for IoT device listing, state queries, and Home Assistant service calls.
- Added voice invitation flow for waiting tasks, including yes/acknowledge acceptance and question time support.
- Added avatar scene addon extension points for custom visual effects and runtime integrations.
- Added runtime plugin lifecycle hook telemetry for queue and worker execution events.
- Added IoT/Home Assistant secret catalog support to `Secrets` UI via OS keychain handles.
- Updated README to document the new IoT feature set and secrets improvements.

### Changed
- Improved `Secrets` management documentation to include IoT token storage.
- Extended `Secrets` tab and plugin lifecycle description in the README.
