// The SDK logger reads LOG_LEVEL on every line: silence the integration's own
// logs while the tests run, unless a run asks for them (LOG_LEVEL=debug).
process.env.LOG_LEVEL ??= 'silent';
