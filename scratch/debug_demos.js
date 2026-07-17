var b = state.alife.npcs.find(n => n && n.name.includes("Баринов"));
var o = state.alife.npcs.find(n => n && n.name.includes("Ольга"));

var bId = state.alife.npcs.indexOf(b);
var oId = state.alife.npcs.indexOf(o);

console.log("РЕАЛЬНЫЕ ИНДЕКСЫ (A-Life):");
console.log(`Барни: alifeId=${bId}, plotNpcId=${b?.plotNpcId}`);
console.log(`Ольга: alifeId=${oId}, plotNpcId=${o?.plotNpcId}`);

var graph = state.demosSocialGraph;
if (graph) {
  console.log("Forcing initialization for Barni and Olga rows to ensure they are built:");
  // Force Demos to build their rows by accessing any slot through the view function
  // We can't access `viewForNpcEdge` easily, but we can do it by simulating what it does.
  // Wait, `viewForNpcEdge` is not exposed. But we know the game triggers initialization when Demos is opened.
  console.log(`graph.initialized[${bId}] = `, graph.initialized[bId]);
  console.log(`graph.initialized[${oId}] = `, graph.initialized[oId]);
}
