import { Maze, Vector } from "./classes.js";

window.onload = async () => {
  let maze = new Maze(10);
  await maze.init();

  // all elements
  let wallEls = [];
  let cellEls = [];
  let nodeEls = [];
  let linkEls = [];

  let currentDivisions = 10; // 10,20,30

  // button event handling
  document
    .getElementById("generate-btn")
    .addEventListener("click", async () => {
      const walls = document.getElementsByClassName("wall");
      const cells = document.getElementsByClassName("cell");
      const nodes = document.getElementsByClassName("node");
      const links = document.getElementsByClassName("link");
      while (walls.length) walls.item(0).remove();
      while (cells.length) cells.item(0).remove();
      while (nodes.length) nodes.item(0).remove();
      while (links.length) links.item(0).remove();
      cellEls = [];
      wallEls = [];
      nodeEls = [];
      linkEls = [];
      await maze.init();
      createMazeElements();
    });
  document.getElementById("scale-control-btn").addEventListener("click", async () => {
    const walls = document.getElementsByClassName("wall");
    const cells = document.getElementsByClassName("cell");
    const nodes = document.getElementsByClassName("node");
    const links = document.getElementsByClassName("link");
    while (walls.length) walls.item(0).remove();
    while (cells.length) cells.item(0).remove();
    while (nodes.length) nodes.item(0).remove();
    while (links.length) links.item(0).remove();
    cellEls = [];
    wallEls = [];
    nodeEls = [];
    linkEls = [];
    currentDivisions += 10
    if(currentDivisions > 30) currentDivisions = 10
    document.getElementById("scale-control-btn").innerText = `Maze scale ${currentDivisions}`
    maze.cellDivisions = currentDivisions
    await maze.init();
    createMazeElements();
  })
  document
    .getElementById("dark-toggle-btn")
    .addEventListener("click", () => {
      document.body.classList.toggle("dark-mode")
    })

  function createMazeElements() {
    let links = [];
    const div = 100 / currentDivisions
    const createLinkEl = (aI, bI, len = 0) => {
      links.push([aI, bI]);
      if (bI === -1 || aI === -1) return;
      const aPos = new Vector(maze.navNodes[aI].x, maze.navNodes[aI].y);
      const bPos = new Vector(maze.navNodes[bI].x, maze.navNodes[bI].y);
      const el = document.createElement("div");
      el.className = "link";
      el.style.width = `${div}%`;
      el.style.height = `${div}%`;
      el.style.left = `${div * aPos.x}%`;
      el.style.top = `${div * aPos.y}%`;
      el.style.position = "absolute";
      let rotate = "";
      if (aPos.y === bPos.y) if (aPos.x < bPos.x) rotate = "90deg";
      if (aPos.x > bPos.x) rotate = "-90deg";
      el.style.scale = `1 ${len * 2}`;
      if (aPos.x === bPos.x) if (aPos.y < bPos.y) rotate = "180deg";
      if (aPos.y > bPos.y) rotate = "0deg";
      el.style.scale = `1 ${len * 2}`;
      el.style.rotate = rotate;
      linkEls.push(el);
    };
    maze.grid.forEach((cell, i) => {
      cell.walls.forEach((wall, i) => {
        if (wall) {
          let side = "";
          switch (i) {
            case 0:
              side = "top";
              break;
            case 1:
              side = "rgt";
              break;
            case 2:
              side = "btm";
              break;
            case 3:
              side = "lft";
              break;
          }
          const el = document.createElement("div");
          el.className = "wall";
          el.style.height =
            side === "lft" || side === "rgt" ? `${div}%` : "1px";
          el.style.width = side === "top" || side === "btm" ? `${div}%` : "1px";
          el.style.left = `${cell.x * div + (side === "rgt" ? div : 0)}%`;
          el.style.top = `calc(${
            cell.y === maze.cellDivisions - 1 ? -1 : 0
          }px + ${cell.y * div + (side === "btm" ? div : 0)}%)`;
          wallEls.push(el);
        }
      });
      const el = document.createElement("div");
      el.style.width = `${div}%`;
      el.style.height = `${div}%`;
      el.style.left = `${cell.x * div}%`;
      el.style.top = `${cell.y * div}%`;
      el.style.position = "absolute";
      el.style.zIndex = "100";
      el.className = "cell";
      el.id = `cell-${i}`;
      //const navNodeIndex = maze.navNodes.findIndex((n) => n.x === cell.x && n.y === cell.y)
      //if(navNodeIndex !== -1) el.innerText = `${Object.keys(maze.navNodes[navNodeIndex].connected).map((k) => `${k}:${JSON.stringify(maze.navNodes[navNodeIndex].connected[k])}\n`)}`
      el.addEventListener("click", maze.togglePathCell);
      cellEls.push(el);
    });
    maze.navNodes.forEach((node, i) => {
      const el = document.createElement("div");
      el.style.width = `${div}%`;
      el.style.height = `${div}%`;
      el.style.left = `${node.x * div}%`;
      el.style.top = `${node.y * div}%`;
      el.style.position = "absolute";
      el.style.zIndex = "100";
      el.className = "node";
      //el.innerText = i;
      nodeEls.push(el);
      Object.keys(node.connected).forEach((key) => {
        if (node.connected[key][0] !== -1)
          createLinkEl(i, node.connected[key][0], node.connected[key][1]);
      });
    });
    wallEls.forEach((el) =>
      document.body.getElementsByClassName("container")[0].appendChild(el)
    );
    cellEls.forEach((el) =>
      document.body.getElementsByClassName("container")[0].appendChild(el)
    );
    nodeEls.forEach((el) =>
      document.body.getElementsByClassName("container")[0].appendChild(el)
    );
    linkEls.forEach((el) =>
      document.body.getElementsByClassName("container")[0].appendChild(el)
    );
  }

  createMazeElements();
};
