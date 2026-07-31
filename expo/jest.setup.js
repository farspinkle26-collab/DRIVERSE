// Tell React 19 it is running inside a test act() environment, so state
// updates from mount effects are flushed by @testing-library/react-native's
// renderHook / render instead of warning and leaving the tree uncommitted.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
