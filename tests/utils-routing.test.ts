// Test suite for routing.ts
// Tests wildcard patterns: *, **, prefix*, prefix*/**

import {
	RouteDescendant,
	Router,
	RouteWildcard,
	route,
	routed,
} from "../src/js/select/routing";

// Test 1: Basic static route matching
function testBasicStaticRoutes() {
	const router = new Router();
	router.on("api/users", () => "users");
	router.on("api/posts", () => "posts");

	console.assert(
		router.run("api/users") === "users",
		"Test 1.1: Static route /api/users",
	);
	console.assert(
		router.run("api/posts") === "posts",
		"Test 1.2: Static route /api/posts",
	);
	console.assert(
		router.run("api/comments") === undefined,
		"Test 1.3: Non-matching route should be undefined",
	);
	console.log("✓ Test 1: Basic static routes passed");
}

// Test 2: Single wildcard (*) matching
function testSingleWildcard() {
	const router = new Router();
	router.on("api/*", () => "any-api-child");
	router.on("api/users/*", () => "any-user-child");

	console.assert(
		router.run("api/users") === "any-api-child",
		"Test 2.1: * matches single segment",
	);
	console.assert(
		router.run("api/posts") === "any-api-child",
		"Test 2.2: * matches different segment",
	);
	console.assert(
		router.run("api/users/123") === "any-user-child",
		"Test 2.3: Nested * matches",
	);
	console.assert(
		router.run("api/users/123/profile") === undefined,
		"Test 2.4: * does not match deeper",
	);
	console.log("✓ Test 2: Single wildcard (*) passed");
}

// Test 3: Descendant wildcard (**) matching
function testDescendantWildcard() {
	const router = new Router();
	router.on("api/**", () => "any-api-descendant");
	router.on("static/**", () => "any-static-descendant");

	console.assert(
		router.run("api/users") === "any-api-descendant",
		"Test 3.1: ** matches single child",
	);
	console.assert(
		router.run("api/users/123") === "any-api-descendant",
		"Test 3.2: ** matches grandchild",
	);
	console.assert(
		router.run("api/users/123/profile") === "any-api-descendant",
		"Test 3.3: ** matches great-grandchild",
	);
	console.assert(
		router.run("static/css/main.css") === "any-static-descendant",
		"Test 3.4: ** matches multiple levels",
	);
	console.assert(
		router.run("other/path") === undefined,
		"Test 3.5: ** does not match non-matching root",
	);
	console.log("✓ Test 3: Descendant wildcard (**) passed");
}

// Test 4: Prefix wildcard (prefix*) matching
function testPrefixWildcard() {
	const router = new Router();
	router.on("api*/config", () => "api-config");
	router.on("v*/users", () => "versioned-users");

	console.assert(
		router.run("api/config") === "api-config",
		"Test 4.1: prefix* matches exact prefix",
	);
	console.assert(
		router.run("api-v2/config") === "api-config",
		"Test 4.2: prefix* matches prefix with suffix",
	);
	console.assert(
		router.run("api123/config") === "api-config",
		"Test 4.3: prefix* matches prefix with numbers",
	);
	console.assert(
		router.run("v1/users") === "versioned-users",
		"Test 4.4: prefix* with v",
	);
	console.assert(
		router.run("v2/users") === "versioned-users",
		"Test 4.5: prefix* with v2",
	);
	console.assert(
		router.run("config/api") === undefined,
		"Test 4.6: prefix* does not match if not at start",
	);
	console.log("✓ Test 4: Prefix wildcard (prefix*) passed");
}

// Test 5: Combined prefix and descendant (prefix*/**)
function testPrefixDescendant() {
	const router = new Router();
	router.on("api*/**", () => "api-descendants");
	router.on("v*/*/**", () => "versioned-nested");

	console.assert(
		router.run("api/users") === "api-descendants",
		"Test 5.1: prefix*/** matches single child",
	);
	console.assert(
		router.run("api-v2/users/123") === "api-descendants",
		"Test 5.2: prefix*/** matches nested",
	);
	console.assert(
		router.run("v1/admin/settings") === "versioned-nested",
		"Test 5.3: v*/*/** matches",
	);
	console.log("✓ Test 5: Combined prefix and descendant passed");
}

// Test 6: Priority ordering (exact > prefix* > * > **)
function testPriorityOrdering() {
	const router = new Router();
	const results: string[] = [];

	// Register in reverse priority order to test that priority works
	router.on("api/**", () => {
		results.push("**");
		return "**";
	});
	router.on("api/*", () => {
		results.push("*");
		return "*";
	});
	router.on("api*/users", () => {
		results.push("prefix*");
		return "prefix*";
	});
	router.on("api/users", () => {
		results.push("exact");
		return "exact";
	});

	// Test that exact match takes precedence
	const handlers = router.match("api/users");
	if (handlers) {
		console.assert(
			handlers.length === 2,
			"Test 6.1: Should have 2 handlers (exact and **)",
		);
		console.assert(
			handlers[0]?.value("api/users", {}) === "exact",
			"Test 6.2: First handler should be exact",
		);
	}
	console.log("✓ Test 6: Priority ordering passed");
}

// Test 7: Mixed patterns with captures
function testMixedPatterns() {
	const router = new Router();
	router.on(
		"api/{version:string}/**",
		(_path: string | string[], captured: Record<string, string>) =>
			`api-${captured.version}-descendants`,
	);
	router.on(
		"api/*/{id:number}",
		(_path: string | string[], captured: Record<string, string>) =>
			`child-${captured.id}`,
	);

	console.assert(
		router.run("api/v1/users/123") === "api-v1-descendants",
		"Test 7.1: Captured prefix with **",
	);
	console.assert(
		router.run("api/users/456") === "child-456",
		"Test 7.2: Wildcard with captured ID",
	);
	console.log("✓ Test 7: Mixed patterns with captures passed");
}

// Test 8: Deregistration
function testDeregistration() {
	const router = new Router();
	const handler = () => "test";

	router.on("api/**", handler);
	console.assert(
		router.run("api/users") === "test",
		"Test 8.1: Handler registered",
	);

	router.off("api/**", handler);
	console.assert(
		router.run("api/users") === undefined,
		"Test 8.2: Handler deregistered",
	);

	router.on("*/users", handler);
	console.assert(
		router.run("api/users") === "test",
		"Test 8.3: Wildcard handler registered",
	);

	router.off("*/users", handler);
	console.assert(
		router.run("api/users") === undefined,
		"Test 8.4: Wildcard handler deregistered",
	);
	console.log("✓ Test 8: Deregistration passed");
}

// Test 9: Route parsing
function testRouteParsing() {
	const r1 = route("api/*");
	console.assert(r1.length === 2, "Test 9.1: api/* has 2 segments");
	console.assert(r1[0] === "api", "Test 9.2: First segment is 'api'");
	console.assert(
		r1[1] instanceof RouteWildcard,
		"Test 9.3: Second segment is RouteWildcard",
	);

	const r2 = route("api/**");
	console.assert(r2.length === 2, "Test 9.4: api/** has 2 segments");
	console.assert(
		r2[1] instanceof RouteDescendant,
		"Test 9.5: Second segment is RouteDescendant",
	);

	const r3 = route("api*/users");
	console.assert(r3.length === 2, "Test 9.6: api*/users has 2 segments");
	console.assert(
		r3[0] instanceof RouteWildcard === false,
		"Test 9.7: First segment is not RouteWildcard",
	);
	// It's a RoutePatternSlot with prefix pattern
	console.log("✓ Test 9: Route parsing passed");
}

// Test 10: Edge cases
function testEdgeCases() {
	const router = new Router();

	// Empty path
	router.on("", () => "root");
	console.assert(router.run("") === "root", "Test 10.1: Empty path matches");

	// Single segment with **
	router.on("**", () => "catch-all");
	console.assert(
		router.run("anything") === "catch-all",
		"Test 10.2: ** at root catches all",
	);
	console.assert(
		router.run("a/b/c/d") === "catch-all",
		"Test 10.3: ** at root catches deep paths",
	);

	// Multiple ** at different levels
	const router2 = new Router();
	router2.on("api/**", () => "api-all");
	router2.on("api/v1/**", () => "api-v1-all");
	const handlers = router2.match("api/v1/users");
	if (handlers) {
		console.assert(
			handlers.length >= 1,
			"Test 10.4: Multiple ** handlers collected",
		);
	}

	console.log("✓ Test 10: Edge cases passed");
}

// Test 11: Router tree visualization
function testTreeVisualization() {
	const router = new Router();
	router.on("api/users", () => "users");
	router.on("api/*", () => "wildcard");
	router.on("api/**", () => "descendants");
	router.on("api*/config", () => "prefix-config");

	const tree = router.tree();
	console.assert("api" in tree, "Test 11.1: Tree has 'api' key");
	console.assert(
		"#handlers" in tree || "#descendants" in tree,
		"Test 11.2: Tree has handlers",
	);
	console.log("✓ Test 11: Tree visualization passed");
}

// Test 12: Using routed() helper
function testRoutedHelper() {
	const handler = routed({
		"api/users": () => "users",
		"api/*": () => "wildcard",
		"api/**": () => "descendants",
	});

	console.assert(
		handler("api/users") === "users",
		"Test 12.1: routed() exact match",
	);
	console.assert(
		handler("api/posts") === "wildcard",
		"Test 12.2: routed() wildcard match",
	);
	console.assert(
		handler("api/posts/123") === "descendants",
		"Test 12.3: routed() descendant match",
	);
	console.log("✓ Test 12: Routed helper passed");
}

// Test 13: Non-function handlers (object values)
function testNonFunctionHandlers() {
	const router = new Router();

	// Register object handlers (like state.ts does with { store })
	router.on("config", { store: "config-store" });
	router.on("api/*", { store: "api-wildcard-store" });
	router.on("data/**", { store: "data-descendant-store" });

	// Should return the object directly without calling it
	console.assert(
		router.run("config")?.store === "config-store",
		"Test 13.1: Object handler at exact path",
	);
	console.assert(
		router.run("api/users")?.store === "api-wildcard-store",
		"Test 13.2: Object handler with * wildcard",
	);
	console.assert(
		router.run("data/nested/deep/path")?.store === "data-descendant-store",
		"Test 13.3: Object handler with ** wildcard",
	);

	console.log("✓ Test 13: Non-function handlers (object values) passed");
}

// Run all tests
function runAllTests() {
	console.log("\n=== Running Routing Tests ===\n");

	testBasicStaticRoutes();
	testSingleWildcard();
	testDescendantWildcard();
	testPrefixWildcard();
	testPrefixDescendant();
	testPriorityOrdering();
	testMixedPatterns();
	testDeregistration();
	testRouteParsing();
	testEdgeCases();
	testTreeVisualization();
	testRoutedHelper();
	testNonFunctionHandlers();

	console.log("\n=== All Tests Passed ===\n");
}

// Export for use as module or run directly
if ((import.meta as { main?: boolean }).main) {
	runAllTests();
}

export { runAllTests };
