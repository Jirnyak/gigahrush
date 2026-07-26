function testLca() {
    const w = 10;
    const parent = new Uint8Array(w * w);
    parent[1] = 0; // 1 -> 0
    parent[2] = 1; // 2 -> 1
    parent[3] = 0; // 3 -> 0
    parent[4] = 3; // 4 -> 3
    
    // We want LCA of 2 and 4. It should be 0.
    const mark = new Uint32Array(w * w);
    let markId = 1;
    
    let a = 2;
    let b = 4;
    
    // Trace a to root
    let currA = a;
    let stepsA = 0;
    while (currA !== 0 && stepsA < 100) {
        mark[currA] = markId;
        currA = parent[currA];
        stepsA++;
    }
    mark[currA] = markId; // mark root
    
    // Trace b to root, finding intersection
    let currB = b;
    let stepsB = 0;
    let lca = -1;
    while (currB !== 0 && stepsB < 100) {
        if (mark[currB] === markId) {
            lca = currB;
            break;
        }
        currB = parent[currB];
        stepsB++;
    }
    if (lca === -1 && mark[currB] === markId) {
        lca = currB;
    }
    
    console.log("LCA:", lca);
}
testLca();
