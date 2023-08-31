const Vector = function (x, y) {
  this.x = x;
  this.y = y;
  this.length = Math.abs(this.x) + Math.abs(this.y);

  this.add = (v) => new Vector(this.x + v.x, this.y + v.y);
  this.subtract = (v) => new Vector(this.x - v.x, this.y - v.y);
  this.multiply = (v) => new Vector(this.x * v.x, this.y * v.y);
};

const Cell = function (
  x,
  y,
  noTop = false,
  noRgt = false,
  noBtm = false,
  noLft = false
) {
  this.x = x;
  this.y = y;
  this.visited = false; // visited by maze generation wall knocking algorithm called recursive backtracking
  this.walls = [!noTop, !noRgt, !noBtm, !noLft]; // will be by default true unless there is a neighbour to the right and below
};

const NavNode = function (
  x,
  y,
  connected = {
    top: [-1, 0],
    rgt: [-1, 0],
    btm: [-1, 0],
    lft: [-1, 0],
  },
  explored = false
) {
  this.x = x;
  this.y = y;
  this.connected = connected; // connected is navigation node index
  this.explored = explored;
};

/**
 * Tick duration should be a multiple of 10
 */
const Maze = function (cellDivisions = 20, tickDuration = 50) {
  this.cellDivisions = cellDivisions;
  this.grid = [];
  this.navNodes = [];

  this.startCell = -1;
  this.finishCell = -1;
  this.runPathFindingTick = false;
  this.tickDuration = Math.max(Math.round(tickDuration / 10) * 10, 10);

  /**
   * Paths:
   * Index 0 - Path array of navigation node indexes
   * Index 1 - Distance traveled (currently not used for anything but the value is set)
   * Index 2 - Direction the path is going in
   */
  this.paths = [];

  /* ----- Helper functions ----- */

  this.getCellIdx = (x, y) => {
    if (typeof x === "undefined") throw new Error("no recorded memory of X");
    if (y !== undefined || y === -1)
      return x < 0 || y < 0 || x > this.cellDivisions - 1 || y > this.cellDivisions - 1
        ? -1
        : x + y * this.cellDivisions;
    return this.getCellIdx(x.x, x.y);
  };

  this.getCellWalls = (i = 0) => {
    if (i === -1 || i > this.cellDivisions * this.cellDivisions)
      throw new Error(`Invalid index "${i}"`);
    const cell = this.grid[i];
    const cellPos = new Vector(cell.x, cell.y);
    const topCell = this.grid[this.getCellIdx(cellPos.add({ x: 0, y: -1 }))];
    const rgtCell = this.grid[this.getCellIdx(cellPos.add({ x: +1, y: 0 }))];
    const btmCell = this.grid[this.getCellIdx(cellPos.add({ x: 0, y: +1 }))];
    const lftCell = this.grid[this.getCellIdx(cellPos.add({ x: -1, y: 0 }))];
    return {
      top: !topCell ? true : cell.walls[0] || topCell.walls[2],
      rgt: !rgtCell ? true : cell.walls[1] || rgtCell.walls[3],
      btm: !btmCell ? true : cell.walls[2] || btmCell.walls[0],
      lft: !lftCell ? true : cell.walls[3] || lftCell.walls[1],
    };
  };

  /**
   * @param {Vector} a
   * @param {Vector} b
   */
  this.removeWallsBetweenTwoCells = (a, b) => {
    const aI = this.getCellIdx(a);
    const bI = this.getCellIdx(b);
    const x = a.x - b.x;
    if (x === 1) {
      this.grid[aI].walls[3] = false;
      this.grid[bI].walls[1] = false;
      return;
    }
    if (x === -1) {
      this.grid[aI].walls[1] = false;
      this.grid[aI].walls[3] = false;
      return;
    }
    const y = a.y - b.y;
    if (y === 1) {
      this.grid[aI].walls[0] = false;
      this.grid[aI].walls[2] = false;
      return;
    }
    if (y === -1) {
      this.grid[aI].walls[2] = false;
      this.grid[bI].walls[0] = false;
      return;
    }
  };

  /**
   * Used by recursive backtracking algorithm which removes walls to form the maze
   * @param {number} x
   * @param {number} y
   */
  this.randomNeighbourCell = (x, y) => {
    let n = [];
    const top = this.grid[this.getCellIdx(x, y - 1)];
    const rgt = this.grid[this.getCellIdx(x + 1, y)];
    const btm = this.grid[this.getCellIdx(x, y + 1)];
    const lft = this.grid[this.getCellIdx(x - 1, y)];
    if (top && !top.visited) n.push(top);
    if (rgt && !rgt.visited) n.push(rgt);
    if (btm && !btm.visited) n.push(btm);
    if (lft && !lft.visited) n.push(lft);
    return n.length > 0 ? n[Math.floor(Math.random() * n.length)] : undefined;
  };

  this.flipDirKey = (k) =>
    k === "top" ? "btm" : k === "btm" ? "top" : k === "rgt" ? "lft" : "rgt";

  /**
   * Turns direction string into direction normal vector
   * @param {string} k
   * @returns
   */
  this.deltaFromDir = (k) =>
    new Vector(
      k === "lft" ? -1 : k === "rgt" ? 1 : 0,
      k === "btm" ? 1 : k === "top" ? -1 : 0
    );

  /**
   * Gets the direction as a string between two vectors A and B
   * @param {Vector} a
   * @param {Vector} b
   */
  this.getDirKey = (a, b) => {
    if (b.y < a.y) return "top";
    if (b.x > a.x) return "rgt";
    if (b.y > a.y) return "btm";
    if (b.x < a.x) return "lft";
    throw new Error(
      "getDirKey only takes parallel positions in range of the grid"
    );
  };

  /* ----- Pathfinding functions -----  */

  /**
   * Link a nav node with its neighbours by tracing outwards in every direction
   * @param {number} i
   */
  this.autoLinkNode = (i) => {
    const pos = this.navNodes.find(
      (n) => n.x === this.navNodes[i].x && n.y === this.navNodes[i].y
    );
    const walls = this.getCellWalls(this.getCellIdx(pos));
    const dirs = Object.keys(walls).filter((k) => !walls[k]);
    for (const dir of dirs) {
      let currPos = new Vector(pos.x, pos.y);
      const delta = this.deltaFromDir(dir);
      while (true) {
        const currWalls = this.getCellWalls(
          this.getCellIdx(currPos.x, currPos.y)
        );
        // straight wall, don't bother checking position for a navigation node
        if (
          (currWalls.top &&
            currWalls.btm &&
            !currWalls.lft &&
            !currWalls.rgt) ||
          (currWalls.lft && currWalls.rgt && !currWalls.top && !currWalls.btm)
        ) {
          currPos = currPos.add(delta);
          continue;
        }
        // if at a corner/junction, it means there's another node there, so connect the nodes
        if (
          (currWalls.top && currWalls.lft && currWalls.rgt && currWalls.btm) ||
          (currWalls.btm && currWalls.rgt && currWalls.lft && currWalls.top) ||
          (currWalls.btm && currWalls.lft && currWalls.rgt && currWalls.top) ||
          (currWalls.top && currWalls.rgt && currWalls.lft && currWalls.btm) ||
          Object.values(walls).reduce((acc, val) => (acc + val ? 1 : 0), 0) <= 1
        ) {
          const otherNodeIdx = this.navNodes.findIndex(
            (n) => n.x === currPos.x && n.y === currPos.y
          );
          if (otherNodeIdx === -1) break;
          const len = new Vector(pos.x, pos.y).subtract(currPos).length;
          if (otherNodeIdx === i) {
            if (walls[dir]) break;
            currPos = currPos.add(delta);
            continue;
          }
          this.navNodes[i].connected[dir] = [otherNodeIdx, len];
          this.navNodes[otherNodeIdx].connected[this.flipDirKey(dir)] = [
            i,
            len,
          ];
          break;
        }
        currPos = currPos.add(delta);
      }
    }
  };

  /**
   * Renders a complete path and stops pathfinding. Takes a complete path,
   * where the destination cell is somewhere between the last two nodes, or on the
   * final node. And the start cell should be either on the first node or before it
   * @param {array} path
   */
  this.pathComplete = async (path) => {
    const originalFinishCell = this.finishCell;
    const originalStartCell = this.startCell;

    this.paths = [];
    this.runPathFindingTick = false;
    for (let i = 0; i < this.cellDivisions * this.cellDivisions; i++)
      document.getElementById(`cell-${i}`).style.backgroundColor =
        "transparent";

    // selects the cells that are going to turn green (cellsInPath)
    let cellsInPath = []; // cell indexes
    const startPos = new Vector(
      this.grid[this.startCell].x,
      this.grid[this.startCell].y
    );
    const finishPos = new Vector(
      this.grid[this.finishCell].x,
      this.grid[this.finishCell].y
    );
    let curr = startPos;
    if (
      (() => {
        if (!(startPos.x === finishPos.x || startPos.y === finishPos.y))
          return false;
        const dir = this.getDirKey(startPos, finishPos);
        const delta = this.deltaFromDir(dir);
        let traceCurr = startPos;
        while (true) {
          const walls = this.getCellWalls(this.getCellIdx(traceCurr));
          if (traceCurr.x === finishPos.x && traceCurr.y === finishPos.y)
            return true;
          if (walls[dir]) return false;
          traceCurr = traceCurr.add(delta);
        }
      })()
    ) {
      // if the path is direct and straight with nothing blocking to the destination
      // then select all the cells between the start cell and the finish cell for recolouring
      const delta = this.deltaFromDir(path[2]);
      while (true) {
        cellsInPath.push(this.getCellIdx(curr));
        if (curr.x === finishPos.x && curr.y === finishPos.y) break;
        curr = curr.add(delta);
      }
    } else {
      // if the path has a corner on it then select all cells along the path for recolouring, like this:
      // 1. add all the cells from the START cell to the first node in the path
      // 2. trace along the path to the next nav node recursively, adding every cell to be recoloured.
      //    If its on the second to last node, trace to the destination cell instead, because it will be
      //    somewhere between that node and the last, and those are the cells that need to be recoloured.
      const firstNodePos = new Vector(
        this.navNodes[path[0][0]].x,
        this.navNodes[path[0][0]].y
      );
      const dir = this.getDirKey(startPos, firstNodePos);
      const delta = this.deltaFromDir(dir);
      while (true) {
        if (curr.x === firstNodePos.x && curr.y === firstNodePos.y) break;
        const ci = this.getCellIdx(curr);
        if (this.getCellWalls(ci)[dir]) break;
        cellsInPath.push(ci);
        curr = curr.add(delta);
      }
      for (let i = 0; i < path[0].length - 1; i++) {
        const currentNodePos = new Vector(
          this.navNodes[path[0][i]].x,
          this.navNodes[path[0][i]].y
        );
        const traceEnd = new Vector(
          this.navNodes[path[0][i + 1]].x,
          this.navNodes[path[0][i + 1]].y
        );
        curr = currentNodePos;
        const delta = this.deltaFromDir(
          this.getDirKey(currentNodePos, traceEnd)
        );
        while (true) {
          if (
            (curr.x === traceEnd.x && curr.y === traceEnd.y) ||
            (curr.x === finishPos.x && curr.y === finishPos.y)
          )
            break;
          cellsInPath.push(this.getCellIdx(curr));
          curr = curr.add(delta);
        }
      }
    }

    // animate the cells
    for await (const cellIdx of cellsInPath) {
      // if either the start or destination cells changed
      // then the pathfinding has to be reset and the animation
      // cancelled (clearPathfinding also clears cell colours)
      if (
        this.finishCell !== originalFinishCell ||
        this.startCell !== originalStartCell
      ) {
        this.clearPathfinding(true);
        this.startCell = -1;
        this.finishCell = -1;
        return;
      }
      if (cellIdx === 0 || cellIdx === cellsInPath.length - 1) continue;
      this.changeCellColour(cellIdx, "var(--cell-start)", true, true);
      await new Promise((r) => setTimeout(r, this.tickDuration * 0.5));
      this.changeCellColour(cellIdx, "var(--cell-path)", false, false);
      this.changeCellColour(this.startCell, "var(--cell-end)", true);
      this.changeCellColour(this.finishCell, "var(--cell-start)", true);
    }
    // make sure that the start cell and destination are still the right colour
    // which they should be anyway...
    this.changeCellColour(this.startCell, "var(--cell-end)", true);
    this.changeCellColour(this.finishCell, "var(--cell-start)", true);

    // clear start and finish cell so pathfinding tick can run normally again when the user chooses a new path
    this.startCell = -1;
    this.finishCell = -1;
  };

  /**
   * Used in pathfinding first tick to get navigation node links by tracing for them along the grid in all
   * directions instead of using the nav mesh like the other function below because the user might select
   * a start or destination cell that doesn't sit ontop of a navigation node.
   * @param {Vector} pos
   * @returns {object}
   */
  this.navTickInitTraceForNodes = (pos) => {
    let curr = pos;
    let out = {
      top: undefined,
      rgt: undefined,
      btm: undefined,
      lft: undefined,
    };
    const startCellWalls = this.getCellWalls(this.getCellIdx(pos));
    for (const dir of ["top", "rgt", "btm", "lft"].filter(
      (dir) => !startCellWalls[dir]
    )) {
      const delta = this.deltaFromDir(dir);
      curr = pos;
      while (true) {
        curr = curr.add(delta);
        const currIdx = this.getCellIdx(curr);
        const walls = this.getCellWalls(currIdx);
        const found = this.navNodes.find(
          (n) => n.x === curr.x && n.y === curr.y
        );
        const len = found
          ? pos.subtract(new Vector(found.x, found.y)).length
          : undefined;
        if (walls[dir] || (!walls[dir] && found)) {
          const complete =
            curr.x === this.grid[this.startCell].x &&
            curr.y === this.grid[this.finishCell].y;
          out[dir] = [
            this.navNodes.findIndex((n) => n.x === found.x && n.y === found.y),
            len,
            complete,
          ];
          break;
        }
        this.changeCellColour(currIdx, "var(--cell-searched)", false);
      }
    }
    return out;
  };

  /**
   * Used for pathfinding, returns the same way as navTickInitTraceForNodes. It returns
   * connected navigation nodes in all directions by accessing the nodes "connected" value.
   * Also will run pathComplete if the destination cell was encountered, and changes the
   * colour of cells to orange.
   * @param {number} nodeIdx
   * @param {number} pathIdx
   * @returns {object}
   */
  this.navTickGetNodeConnections = (nodeIdx, pathIdx) => {
    const prevNodes = this.paths[pathIdx][0];
    const node = this.navNodes[nodeIdx];
    const nodePos = new Vector(node.x, node.y);
    const finish = this.grid[this.finishCell];
    let out = {
      top: undefined,
      rgt: undefined,
      btm: undefined,
      lft: undefined,
    };
    let curr = nodePos;
    for (const dir of ["top", "rgt", "btm", "lft"]) {
      const linkedNode = this.navNodes[node.connected[dir][0]];
      if (linkedNode) {
        const distance = nodePos.subtract(
          new Vector(linkedNode.x, linkedNode.y)
        ).length;
        if (
          // if the node hasn't already been visited in the path
          !prevNodes.includes(node.connected[dir][0]) ||
          // if the node isn't the starting node
          (this.startCell.x !== this.navNodes[node.connected[dir][0]].x &&
            this.startCell.y !== this.navNodes[node.connected[dir][0]].y)
        ) {
          // check if the destination cell was somewhere between the two
          // positions (path complete) using a turnary with confusing
          // variable names
          const axis = dir === "rgt" || dir === "lft" ? "x" : "y";
          const otherAxis = axis === "x" ? "y" : "x";
          out[dir] = [
            // nav node index of connected node
            this.navNodes.findIndex(
              (n) => n.x === linkedNode.x && n.y === linkedNode.y
            ),
            // distance to connected node
            distance,
            // is the destination cell somewhere along the way
            finish[otherAxis] === nodePos[otherAxis]
              ? finish[axis] < nodePos[axis]
                ? finish[axis] >= linkedNode[axis] &&
                  finish[axis] <= nodePos[axis]
                : finish[axis] <= linkedNode[axis] &&
                  finish[axis] >= nodePos[axis]
              : false,
          ];
        }
        // change the colour of the cells by tracing through.
        // this isn't added to the counter because it's only for animation
        curr = nodePos;
        while (true) {
          const currIdx = this.getCellIdx(curr);
          const walls = this.getCellWalls(currIdx);
          // stop trace when it hits a wall or reaches the node
          if (
            walls[dir] ||
            (linkedNode &&
              linkedNode.x === this.grid[currIdx].x &&
              linkedNode.y === this.grid[currIdx].y)
          )
            break;
          curr = curr.add(this.deltaFromDir(dir));
          this.changeCellColour(currIdx, "var(--cell-searched)", false);
        }
      }
    }
    return out;
  };

  const pathFinding = () => {
    if (!this.runPathFindingTick) return;

    // first tick
    if (this.paths.length === 0) {

      const startPos = new Vector(
        this.grid[this.startCell].x,
        this.grid[this.startCell].y
      );
      const nodes = this.navTickInitTraceForNodes(startPos);
      for (const dir of ["top", "rgt", "btm", "lft"].filter((d) => nodes[d])) {
        // if there's a branch put it first in the array
        this.paths.unshift([[nodes[dir][0]], nodes[dir][1], dir]);
        const node = this.navNodes[nodes[dir][0]];
        const destinationPos = new Vector(
          this.grid[this.finishCell].x,
          this.grid[this.finishCell].y
        );
        const deltaNorm = this.deltaFromDir(dir);
        const deltaFull = startPos.subtract(node);
        // if the start and destination are right next to eachother then just check if there's a wall
        if (deltaFull.length === 1) {
          const walls = this.getCellWalls(this.startCell);
          if (!walls[dir]) {
            if (this.getCellIdx(startPos.add(deltaNorm)) === this.finishCell) {
              this.pathComplete(this.paths[0][this.paths[0].length - 1]);
              return;
            }
          }
        } else {
          const traceEnd = new Vector(node.x, node.y);
          let curr = startPos;
          while (true) {
            if (curr.x === destinationPos.x && curr.y === destinationPos.y) {
              this.pathComplete(this.paths[0][this.paths[0].length - 1]);
              return;
            }
            if (curr.x === traceEnd.x && curr.y === traceEnd.y) break;
            curr = curr.add(deltaNorm);
          }
        }
      }
      this.paths.forEach((p) =>
        this.changeCellColour(
          this.getCellIdx(this.navNodes[p[0]]),
          "var(--cell-explore)",
          true,
          true
        )
      );
      return;
    }

    // main tick
    const pathIdx = Math.max(0, this.paths.length - 1); // check the last one, breadth first
    const nodes = this.navTickGetNodeConnections(
      this.paths[pathIdx][0][this.paths[pathIdx][0].length - 1],
      pathIdx
    );
    let newPath = this.paths[pathIdx];
    let newPaths = [];
    let pathExtended,
      notDeadEnd,
      wasExplored = false;
    for (const dir of ["top", "rgt", "btm", "lft"]) {
      if (nodes[dir]) {
        wasExplored = this.navNodes[nodes[dir][0]].explored;
        if (wasExplored) continue;
        this.navNodes[nodes[dir][0]].explored = true;
        // if the path hasn't been extended already extend it, otherwise check for branches
        if (!pathExtended) {
          newPath = [
            [...newPath[0], nodes[dir][0]],
            nodes[dir][1] + newPath[1],
            dir,
          ];
          // check navTickGetNodeConnections returned that the path was complete (index 2)
          if (nodes[dir][2]) {
            this.pathComplete(newPath);
            return;
          }
          this.changeNodeCellColour(
            nodes[dir][0],
            "var(--cell-explore)",
            true,
            true
          );
          pathExtended = true;
          notDeadEnd = true;
        } else {
          const path = [
            [...this.paths[pathIdx][0], nodes[dir][0]],
            nodes[dir][1] + this.paths[pathIdx][1],
            dir,
          ];
          // check navTickGetNodeConnections returned that the path was complete (index 2)
          if (nodes[dir][2]) {
            this.pathComplete(path);
            return;
          }
          newPaths.unshift(path);
          this.changeNodeCellColour(
            nodes[dir][0],
            "var(--cell-explore)",
            true,
            true
          );
          notDeadEnd = true;
        }
      }
    }

    // make sure that the start cell and destination are still the right colour
    // which they should be anyway but I can't be asked to fix it
    this.changeCellColour(this.startCell, "var(--cell-end)", true);
    this.changeCellColour(this.finishCell, "var(--cell-start)", true);

    // after visiting a path update the array and in a way so that most recently visited paths are first
    // also paths that reached deadends are filtered out.
    this.paths.pop();
    this.paths = [
      ...newPaths,
      ...(notDeadEnd && newPath ? [newPath] : []),
      ...this.paths,
    ];
  };

  // Start the pathfinding loop. It runs every 10ms but only calls the pathfinding tick function when
  // the number of iterations reaches modulo "targetDuration" which is calculated to be shorter depending
  // on how many paths there are to counter the animation slowing down. I don't think it works perfectly
  // but it looks a lot better.
  this.navTickIterations = 0;
  this.pathFindingTickInterval = setInterval(() => {
    const targetDuration = tickDuration * (1 / (this.paths.length || 1));
    if (this.navTickIterations % (targetDuration / 10) < 1) pathFinding();
    this.navTickIterations += 1;
  }, 10);

  this.init = () =>
    new Promise((r) => {
      this.grid = [];
      this.navNodes = [];
      this.clearPathfinding(true);
      this.startCell = -1;
      this.finishCell = -1;
      // create the grid cells and walls. Some rules added to not create overlapping walls on neighbouring cells.
      for (let j = 0; j < this.cellDivisions; j++)
        for (let i = 0; i < this.cellDivisions; i++)
          this.grid.push(new Cell(i, j, j === 0, false, true, true));
      // remove walls with recursive backtracking until every cell is visited
      let curr = this.grid[0];
      let next = this.randomNeighbourCell(curr.x, curr.y);
      let wallRemoverStack = [];
      let visited = 0;
      while (visited < this.cellDivisions * this.cellDivisions) {
        if (next) {
          visited++;
          next.visited = true;
          wallRemoverStack.push(curr);
          this.removeWallsBetweenTwoCells(curr, next);
          curr = next;
        } else if (wallRemoverStack.length !== 0) {
          curr = wallRemoverStack.pop();
        }
        next = this.randomNeighbourCell(curr.x, curr.y);
      }
      // generates navigation nodes by checking for junctions and corners, using maze functions for checking direction, magnitude doesn't
      // really matter
      visited = 0;
      while (visited < this.cellDivisions * this.cellDivisions) {
        const cell = this.grid[visited];
        const walls = this.getCellWalls(visited);
        let node = new NavNode(cell.x, cell.y);
        if (visited === 0) {
          this.navNodes.push(node);
          visited++;
          continue;
        }
        // don't create nav nodes in corridoors
        if (
          (walls.top === true &&
            walls.btm === true &&
            walls.lft === false &&
            walls.rgt === false) ||
          (walls.lft === true &&
            walls.rgt === true &&
            walls.top === false &&
            walls.btm === false)
        ) {
          visited++;
          continue;
        }
        if (
          // corner nodes
          (walls.top === true &&
            walls.lft === true &&
            walls.rgt === false &&
            walls.btm === false) ||
          (walls.btm === true &&
            walls.rgt === true &&
            walls.lft === false &&
            walls.top === false) ||
          (walls.btm === true &&
            walls.lft === true &&
            walls.rgt === false &&
            walls.top === false) ||
          (walls.top === true &&
            walls.rgt === true &&
            walls.lft === false &&
            walls.btm === false) ||
          // junction nodes have 1 or less walls
          Object.values(walls).reduce((acc, val) => (acc + val ? 1 : 0), 0) <= 1
        ) {
          // create the node and connect it to others automatically
          this.navNodes.push(node);
          this.autoLinkNode(this.navNodes.length - 1);
          visited++;
        }
      }
      r();
    });

  /**
   * Remove all paths, change the colours back to normal, clear start and destination cells,
   * cancel pathfinding tick.
   */
  this.clearPathfinding = (clearColouring = false) => {
    this.runPathFindingTick = false;
    this.paths = [];
    this.cellsExplored = 0;
    this.nodesExplored = 0;
    this.navNodes.forEach((_, i) => {
      this.navNodes[i].explored = false;
    });
    if (clearColouring)
      this.grid.forEach((_, i) => this.changeCellColour(i, "transparent"));
  };

  /**
   * Very ugly looking event handler for clicking on cells. Changes the colour of the cells,
   * and automatically toggles pathfinding.
   */
  this.togglePathCell = (e) => {
    const i = Number(e.srcElement.id.replaceAll("cell-", ""));
    const changeColour = (isB) => {
      if (!isB) this.clearPathfinding(true);
      e.srcElement.style.backgroundColor = isB
        ? "var(--cell-start)"
        : "var(--cell-end)";
      e.srcElement.style.filter = "opacity(var(--lit-cell-opacity))";
    };
    const removeColour = () =>
      (e.srcElement.style.backgroundColor = "rgba(0,0,0,0)");
    if (this.startCell === -1) {
      this.startCell = i;
      changeColour(false);
      return;
    } else if (i === this.startCell) {
      const bEl = document.getElementById(`cell-${this.finishCell}`);
      if (bEl) bEl.style.backgroundColor = "rgba(0,0,0,0)";
      this.startCell = -1;
      this.finishCell = -1;
      this.runPathFindingTick = false;
      removeColour();
      this.grid.forEach((_, i) => {
        const el = document.getElementById(`cell-${i}`);
        el.style.backgroundColor = "rgba(0,0,0,0)";
      });
      this.paths = [];
      this.navNodes.forEach((_, i) => {
        this.navNodes[i].explored = false;
      });
      return;
    }
    if (this.finishCell === -1) {
      this.finishCell = i;
      changeColour(true);
      this.paths = [];
      this.navNodes.forEach((_, i) => {
        this.navNodes[i].explored = false;
      });
      this.runPathFindingTick = true;
      return;
    } else if (i === this.finishCell) {
      this.finishCell = -1;
      removeColour();
      this.runPathFindingTick = false;
      return;
    }
    if (this.startCell !== -1 && this.finishCell !== -1) {
      document.getElementById(`cell-${this.finishCell}`).style.backgroundColor =
        "rgba(0,0,0,0)";
      this.finishCell = i;
      changeColour(true);
      this.paths = [];
      this.navNodes.forEach((_, i) => {
        this.navNodes[i].explored = false;
      });
      return;
    }
  };

  this.changeNodeCellColour = (
    i,
    colour = "var(--cell-explore)",
    bright = false,
    instant = false
  ) => {
    const el = document.getElementById(
      `cell-${this.getCellIdx(this.navNodes[i].x, this.navNodes[i].y)}`
    );
    el.style.filter = bright
      ? "opacity(var(--lit-cell-opacity))"
      : "opacity(var(--dim-cell-opacity))";
    el.style.transition = instant ? "none" : "background-color 250ms ease-in";
    el.style.backgroundColor = colour;
  };

  this.changeCellColour = (
    i,
    colour = "var(--cell-explore)",
    bright = false,
    instant = false
  ) => {
    const el = document.getElementById(`cell-${i}`);
    if (!el) {
      console.warn("Invalid cell index used in change cell colour");
      return;
    }
    el.style.filter = bright
      ? "opacity(var(--lit-cell-opacity))"
      : "opacity(var(--dim-cell-opacity))";
    el.style.transition = instant ? "none" : "background-color 250ms ease-in";
    el.style.backgroundColor = colour;
  };
};

export { Vector, Cell, NavNode, Maze };
