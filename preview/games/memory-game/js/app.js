/**
 * Main Application - UI initialization and event handling
 */

let game = null;

document.addEventListener('DOMContentLoaded', () => {
    initSetupScreen();
    initGameScreen();
    initResultScreen();
});

/**
 * Initialize the setup screen event handlers
 */
function initSetupScreen() {
    // Button group selection
    document.querySelectorAll('.btn-group').forEach(group => {
        group.querySelectorAll('.btn-option').forEach(btn => {
            btn.addEventListener('click', () => {
                group.querySelectorAll('.btn-option').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
        });
    });

    // Mode toggle: show/hide difficulty and player2 name
    const modeButtons = document.querySelectorAll('#mode-select .btn-option');
    modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.value;
            const diffGroup = document.getElementById('difficulty-group');
            const p2Field = document.getElementById('player2-name-field');

            if (mode === 'ai') {
                diffGroup.style.display = 'block';
                p2Field.style.display = 'none';
                document.getElementById('player2-name').value = '컴퓨터';
            } else {
                diffGroup.style.display = 'none';
                p2Field.style.display = 'block';
                document.getElementById('player2-name').value = '플레이어 2';
            }
        });
    });

    // Start game button
    document.getElementById('start-game').addEventListener('click', startGame);

    // Set initial state (default: AI mode)
    document.querySelector('#mode-select [data-value="ai"]').click();
}

/**
 * Initialize the game screen elements
 */
function initGameScreen() {
    document.getElementById('back-to-menu').addEventListener('click', () => {
        showScreen('setup-screen');
    });

    document.getElementById('restart-game').addEventListener('click', () => {
        if (game) {
            const config = getGameConfig();
            startGameWithConfig(config);
        }
    });
}

/**
 * Initialize the result screen buttons
 */
function initResultScreen() {
    document.getElementById('play-again').addEventListener('click', () => {
        if (game) {
            const config = getGameConfig();
            startGameWithConfig(config);
        }
    });

    document.getElementById('back-to-menu-result').addEventListener('click', () => {
        showScreen('setup-screen');
    });
}

/**
 * Get the current game configuration from the setup screen
 */
function getGameConfig() {
    const mode = document.querySelector('#mode-select .selected').dataset.value;
    const difficulty = document.querySelector('#difficulty-select .selected')?.dataset.value || 'normal';
    const gridSize = parseInt(document.querySelector('#grid-select .selected').dataset.value);
    const theme = document.querySelector('#theme-select .selected').dataset.value;
    const player1Name = document.getElementById('player1-name').value || '플레이어 1';
    const player2Name = document.getElementById('player2-name').value || '플레이어 2';

    return { mode, difficulty, gridSize, theme, player1Name, player2Name };
}

/**
 * Start a new game
 */
function startGame() {
    const config = getGameConfig();
    startGameWithConfig(config);
}

/**
 * Start a new game with the given configuration
 */
function startGameWithConfig(config) {
    game = new MemoryGame(config);
    setupCallbacks(game);
    renderBoard(game);
    updateUI(game);
    showScreen('game-screen');
}

/**
 * Set up all game callbacks
 */
function setupCallbacks(g) {
    g.onCardFlip = (index, value) => {
        const cardEl = document.querySelector(`.card[data-index="${index}"]`);
        if (cardEl) {
            cardEl.classList.add('flipped');
            cardEl.querySelector('.card-front').textContent = value;
        }
    };

    g.onMatch = (idx1, idx2, value) => {
        const el1 = document.querySelector(`.card[data-index="${idx1}"]`);
        const el2 = document.querySelector(`.card[data-index="${idx2}"]`);
        if (el1) el1.classList.add('matched');
        if (el2) el2.classList.add('matched');
        updateUI(g);
    };

    g.onMismatch = (idx1, idx2, val1, val2) => {
        const el1 = document.querySelector(`.card[data-index="${idx1}"]`);
        const el2 = document.querySelector(`.card[data-index="${idx2}"]`);
        if (el1) {
            el1.classList.add('wrong');
            setTimeout(() => {
                el1.classList.remove('flipped', 'wrong');
            }, 400);
        }
        if (el2) {
            el2.classList.add('wrong');
            setTimeout(() => {
                el2.classList.remove('flipped', 'wrong');
            }, 400);
        }
        updateUI(g);
    };

    g.onTurnChange = (playerIndex) => {
        updateUI(g);
    };

    g.onScoreChange = (playerIndex, score) => {
        document.getElementById(`score-p${playerIndex + 1}`).textContent = score;
    };

    g.onGameOver = (winner, scores) => {
        showResult(winner, scores);
    };

    g.onAIThinking = () => {
        document.getElementById('turn-indicator').textContent = '🤔 컴퓨터가 생각 중...';
    };

    g.onAIMove = (index) => {
        const cardEl = document.querySelector(`.card[data-index="${index}"]`);
        if (cardEl) {
            cardEl.classList.add('ai-card');
        }
    };
}

/**
 * Render the game board
 */
function renderBoard(g) {
    const board = document.getElementById('game-board');
    board.innerHTML = '';
    board.dataset.size = g.gridSize;

    g.cards.forEach((card, index) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'card';
        cardEl.dataset.index = index;

        const front = document.createElement('div');
        front.className = 'card-face card-front';
        front.textContent = '';

        const back = document.createElement('div');
        back.className = 'card-face card-back';

        cardEl.appendChild(front);
        cardEl.appendChild(back);

        cardEl.addEventListener('click', () => {
            if (g.flipCard(index)) {
                // Card flip is handled by the callback
            }
        });

        board.appendChild(cardEl);
    });
}

/**
 * Update the UI (scores, turn indicator, round info)
 */
function updateUI(g) {
    // Player names
    document.getElementById('display-name-p1').textContent = g.playerNames[0];
    document.getElementById('display-name-p2').textContent = g.playerNames[1];

    // Scores
    document.getElementById('score-p1').textContent = g.scores[0];
    document.getElementById('score-p2').textContent = g.scores[1];

    // Active turn highlight
    document.getElementById('player1-info').classList.toggle('active-turn', g.currentPlayer === 0);
    document.getElementById('player2-info').classList.toggle('active-turn', g.currentPlayer === 1);

    // Turn indicator
    const currentName = g.playerNames[g.currentPlayer];
    const turnText = g.mode === 'ai' && g.currentPlayer === 1
        ? `🤖 ${currentName}의 차례`
        : `🎮 ${currentName}의 차례`;
    document.getElementById('turn-indicator').textContent = turnText;

    // Round info
    document.getElementById('round-info').textContent = `매칭 ${g.matchedPairs} / ${g.totalPairs}`;
}

/**
 * Show the result screen
 */
function showResult(winner, scores) {
    const title = document.getElementById('result-title');
    const content = document.getElementById('result-content');

    if (winner === -1) {
        title.textContent = '🤝 무승부!';
        content.innerHTML = `
            <p>두 플레이어 모두 ${scores[0]}점으로 동점입니다!</p>
        `;
    } else {
        const winnerName = game.playerNames[winner];
        const winnerScore = scores[winner];
        const loserScore = scores[winner === 0 ? 1 : 0];
        title.textContent = `🏆 ${winnerName} 승리!`;
        content.innerHTML = `
            <p>${winnerName}: ${winnerScore}점</p>
            <p>${game.playerNames[winner === 0 ? 1 : 0]}: ${loserScore}점</p>
            <p>총 ${game.turnCount}턴 만에 승부가 결정되었습니다!</p>
        `;
    }

    showScreen('result-screen');
}

/**
 * Show a specific screen and hide others
 */
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// Register service worker for offline support and PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
        console.log('ServiceWorker registration failed:', err);
    });
}
