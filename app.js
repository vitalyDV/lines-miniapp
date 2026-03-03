const { createApp, reactive, computed, watch } = Vue;

const FIELD_WIDTH = 10;
const FIELD_HEIGHT = 10;
const CELL_SIZE = 40;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function createEmptyMatrix() {
    return Array.from({ length: FIELD_HEIGHT }, () => Array(FIELD_WIDTH).fill(0));
}

const App = {
    setup() {
        const state = reactive({
            config: {
                basebonus: 10,
                colors: 5,
                dispense: 3,
                teleport: false,
                destroyline: 5,
                hint: true,
            },
            drawer: false,
            next: [],
            bonus: 0,
            selected: false,
            finished: false,
            matrix: createEmptyMatrix(),
            possibleMoves: [],
        });

        const boardWidth = computed(() => FIELD_WIDTH * CELL_SIZE);
        const boardHeight = computed(() => FIELD_HEIGHT * CELL_SIZE);

        function getCellPosition(x, y) {
            if (x > FIELD_WIDTH || y > FIELD_HEIGHT) return false;
            return ((y - 1) * FIELD_WIDTH) + x;
        }

        function position2coords(position) {
            let y = Math.trunc(position / FIELD_WIDTH);
            if (position / FIELD_WIDTH - y === 0) {
                y -= 1;
            }
            const x = position - (y * FIELD_WIDTH);
            return [x, y + 1];
        }

        function generateBalls(ballCount) {
            const newBalls = [];
            const usedNumbers = [];

            for (let index = 0; index < ballCount; index += 1) {
                const randomX = Math.floor((Math.random() * FIELD_WIDTH) + 1);
                const randomY = Math.floor((Math.random() * FIELD_HEIGHT) + 1);
                const color = Math.floor((Math.random() * state.config.colors) + 1);
                const coord = getCellPosition(randomX, randomY);

                if (coord && state.matrix[randomY - 1][randomX - 1] === 0 && usedNumbers.indexOf(coord) === -1) {
                    newBalls.push({
                        color,
                        coords: coord,
                        x: randomX - 1,
                        y: randomY - 1,
                    });
                    usedNumbers.push(coord);
                    continue;
                }

                index -= 1;
            }

            return newBalls;
        }

        function getFreeSpace() {
            let freeSpace = FIELD_WIDTH * FIELD_HEIGHT;

            for (let y = 0; y < state.matrix.length; y += 1) {
                for (let x = 0; x < state.matrix[y].length; x += 1) {
                    if (state.matrix[y][x] !== 0) {
                        freeSpace -= 1;
                    }
                }
            }

            return freeSpace;
        }

        function build() {
            state.next = [];
            state.bonus = 0;
            state.selected = false;
            state.possibleMoves = [];
            state.finished = false;
            state.matrix = createEmptyMatrix();
            setBalls();
        }

        function setBalls() {
            let ballCount = state.config.dispense;
            let freeSpace = getFreeSpace();

            if (freeSpace === 0) {
                state.finished = true;
                return false;
            }

            if (freeSpace < ballCount) {
                ballCount = freeSpace;
            }

            if (state.next.length === 0) {
                state.next = generateBalls(ballCount);
            }

            state.next.forEach((ball) => {
                if (state.matrix[ball.y][ball.x] === 0) {
                    state.matrix[ball.y][ball.x] = ball.color;
                    return;
                }

                const other = generateBalls(1);
                state.matrix[other[0].y][other[0].x] = ball.color;
            });

            freeSpace -= ballCount;
            if (freeSpace === 0) {
                state.finished = true;
                state.next = [];
                destroyLines();
                return false;
            }

            state.next = generateBalls(Math.min(ballCount, freeSpace));
            destroyLines();
            return true;
        }

        function getNeighborhoods(coord) {
            const neighbors = [];
            const [X, Y] = position2coords(coord);

            function pushCell(x, y, pos) {
                neighbors.push({
                    x,
                    y,
                    color: state.matrix[y - 1][x - 1],
                    coord: getCellPosition(x, y),
                    pos,
                });
            }

            if (X > 1) pushCell(X - 1, Y, "left");
            if (X > 1 && Y > 1) pushCell(X - 1, Y - 1, "upleft");
            if (X > 1 && Y < FIELD_HEIGHT) pushCell(X - 1, Y + 1, "downleft");
            if (X < FIELD_WIDTH) pushCell(X + 1, Y, "right");
            if (X < FIELD_WIDTH && Y < FIELD_HEIGHT) pushCell(X + 1, Y + 1, "downright");
            if (X < FIELD_WIDTH && Y > 1) pushCell(X + 1, Y - 1, "upright");
            if (Y > 1) pushCell(X, Y - 1, "up");
            if (Y < FIELD_HEIGHT) pushCell(X, Y + 1, "down");

            return neighbors;
        }

        function setPossibleMoves(pos) {
            const neighbors = getNeighborhoods(pos);
            neighbors.forEach((cell) => {
                if (["up", "down", "right", "left"].indexOf(cell.pos) === -1) return;
                if (cell.color !== 0) return;
                if (state.possibleMoves.indexOf(cell.coord) !== -1) return;
                state.possibleMoves.push(cell.coord);
                setPossibleMoves(cell.coord);
            });
        }

        function getLineStarts() {
            const starts = [];
            const allow = ["right", "down", "downright", "downleft"];

            for (let y = 0; y < state.matrix.length; y += 1) {
                for (let x = 0; x < state.matrix[y].length; x += 1) {
                    const color = state.matrix[y][x];
                    if (color === 0) continue;

                    const startPos = getCellPosition(x + 1, y + 1);
                    const neighbors = getNeighborhoods(startPos);

                    neighbors.forEach((cell) => {
                        if (allow.indexOf(cell.pos) === -1 || cell.color !== color) {
                            return;
                        }

                        let continues = false;
                        starts.forEach((line, lineIndex) => {
                            if (cell.pos === line.direction && line.balls.indexOf(startPos) !== -1) {
                                continues = true;
                                starts[lineIndex].balls.push(cell.coord);
                            }
                        });

                        if (!continues) {
                            starts.push({
                                start: startPos,
                                color,
                                direction: cell.pos,
                                balls: [startPos, cell.coord],
                            });
                        }
                    });
                }
            }

            return starts;
        }

        function destroyLines() {
            const starts = getLineStarts();
            let destroyed = false;

            starts.forEach((line) => {
                if (line.balls.length < state.config.destroyline) {
                    return;
                }

                line.balls.forEach((coords) => {
                    const [x, y] = position2coords(coords);
                    state.matrix[y - 1][x - 1] = 0;
                });

                destroyed = true;
                state.bonus += Math.round((line.balls.length / state.config.destroyline) * state.config.basebonus);
            });

            return destroyed;
        }

        function clickCell(x, y) {
            if (state.finished) {
                return;
            }

            const coord = getCellPosition(x, y);
            const color = state.matrix[y - 1][x - 1];

            if (color > 0) {
                state.selected = coord;
                return;
            }

            if (color === 0 && state.selected) {
                if (state.possibleMoves.indexOf(coord) === -1 && !state.config.teleport) {
                    return;
                }

                const [fromX, fromY] = position2coords(state.selected);
                const moveColor = state.matrix[fromY - 1][fromX - 1];
                state.matrix[fromY - 1][fromX - 1] = 0;
                state.matrix[y - 1][x - 1] = moveColor;
                state.selected = false;

                if (!destroyLines()) {
                    setBalls();
                }
            }
        }

        function getClass(x, y) {
            const classes = [];
            const coord = getCellPosition(x, y);

            if (coord === state.selected) {
                classes.push("selected");
            }

            if (state.matrix[y - 1][x - 1] > 0) {
                classes.push("ball", `c${state.matrix[y - 1][x - 1]}`);
            } else if (state.config.hint) {
                state.next.forEach((ball) => {
                    if (ball.x === x - 1 && ball.y === y - 1) {
                        classes.push("next", `c${ball.color}`);
                    }
                });
            }

            return classes.join(" ");
        }

        function bootstrapTelegram() {
            const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
            if (!tg) {
                return;
            }

            tg.ready();
            tg.expand();
            document.documentElement.style.setProperty("--tg-viewport-height", `${tg.viewportHeight || window.innerHeight}px`);

            const syncTheme = () => {
                const bg = tg.themeParams.bg_color || "#111827";
                const text = tg.themeParams.text_color || "#e5e7eb";
                const secondary = tg.themeParams.hint_color || "#94a3b8";
                document.documentElement.style.setProperty("--tg-bg", bg);
                document.documentElement.style.setProperty("--tg-text", text);
                document.documentElement.style.setProperty("--tg-muted", secondary);
            };

            syncTheme();
            if (typeof tg.onEvent === "function") {
                tg.onEvent("themeChanged", syncTheme);
                tg.onEvent("viewportChanged", () => {
                    document.documentElement.style.setProperty("--tg-viewport-height", `${tg.viewportHeight || window.innerHeight}px`);
                });
            }
        }

        watch(
            () => [state.config.colors, state.config.dispense, state.config.destroyline, state.config.teleport, state.config.hint],
            () => {
                state.config.colors = clamp(state.config.colors, 3, 8);
                state.config.dispense = clamp(state.config.dispense, 2, 5);
                state.config.destroyline = clamp(state.config.destroyline, 3, 7);
                build();
            },
        );

        watch(
            () => state.selected,
            (selected) => {
                state.possibleMoves = [];
                if (selected) {
                    setPossibleMoves(selected);
                }
            },
        );

        bootstrapTelegram();
        build();

        return {
            state,
            FIELD_WIDTH,
            FIELD_HEIGHT,
            boardWidth,
            boardHeight,
            clickCell,
            getClass,
            getCellPosition,
            build,
        };
    },
    template: `
        <main class="mini-shell">
            <section class="app-card">
                <header class="app-header">
                    <button class="ui-button ui-button-secondary" type="button" @click="state.drawer = true">Settings</button>
                </header>

                <section class="stats-panel">
                    <div class="score-box">
                        <span class="score-label">Score</span>
                        <strong>{{ state.bonus }}</strong>
                    </div>
                    <div class="next-box" @click="build">
                        <span class="next-label">Next</span>
                        <div class="next-balls">
                            <span v-for="ball in state.next" :key="ball.coords" :class="'ball c' + ball.color"></span>
                        </div>
                    </div>
                </section>

                <section class="board-shell">
                    <div
                        class="field"
                        :class="{ over: state.finished, onselect: state.selected }"
                        :style="{ width: boardWidth + 'px', height: boardHeight + 'px' }"
                    >
                        <div v-for="(row, y) in state.matrix" :key="'row-' + y" class="row">
                            <button
                                v-for="(cell, x) in row"
                                :key="'cell-' + x + '-' + y"
                                class="cell"
                                type="button"
                                @click="clickCell(x + 1, y + 1)"
                            >
                                <span :class="getClass(x + 1, y + 1)"></span>
                            </button>
                        </div>
                    </div>
                    <p v-if="state.finished" class="status-text">No moves left</p>
                </section>

                <footer class="app-footer">
                    <button class="ui-button ui-button-primary" type="button" @click="build">New Game</button>
                </footer>
            </section>

            <div v-if="state.drawer" class="drawer-backdrop" @click="state.drawer = false"></div>
            <aside class="drawer" :class="{ 'drawer-open': state.drawer }" aria-label="Settings panel">
                <div class="drawer-header">
                    <h2>Settings</h2>
                    <button class="drawer-close" type="button" @click="state.drawer = false" aria-label="Close settings">Close</button>
                </div>
                <div class="controls">
                    <div class="control">
                        <label for="colors-range">Colors</label>
                        <div class="range-row">
                            <input id="colors-range" v-model.number="state.config.colors" type="range" min="3" max="8" step="1">
                            <input v-model.number="state.config.colors" type="number" min="3" max="8" step="1">
                        </div>
                    </div>
                    <div class="control">
                        <label for="dispense-range">Balls Per Turn</label>
                        <div class="range-row">
                            <input id="dispense-range" v-model.number="state.config.dispense" type="range" min="2" max="5" step="1">
                            <input v-model.number="state.config.dispense" type="number" min="2" max="5" step="1">
                        </div>
                    </div>
                    <div class="control">
                        <label for="destroyline-range">Line Length To Clear</label>
                        <div class="range-row">
                            <input id="destroyline-range" v-model.number="state.config.destroyline" type="range" min="3" max="7" step="1">
                            <input v-model.number="state.config.destroyline" type="number" min="3" max="7" step="1">
                        </div>
                    </div>
                    <hr class="drawer-divider">
                    <label class="checkbox-row">
                        <input v-model="state.config.teleport" type="checkbox">
                        <span>Teleport</span>
                    </label>
                    <label class="checkbox-row">
                        <input v-model="state.config.hint" type="checkbox">
                        <span>Show Hints</span>
                    </label>
                    <p class="drawer-note">Board size is fixed: {{ FIELD_WIDTH }} x {{ FIELD_HEIGHT }}</p>
                </div>
            </aside>
        </main>
    `,
};

const app = createApp(App);
app.mount("#app");
