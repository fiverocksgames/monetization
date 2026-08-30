/**
 * Math Rain - App Controller
 * Manages UI, animations, and user interactions
 */

class MathRainApp {
    constructor() {
        this.game = null;
        this.animationFrame = null;
        this.lastTime = 0;

        // DOM elements
        this.screens = {
            setup: document.getElementById('setup-screen'),
            game: document.getElementById('game-screen'),
            result: document.getElementById('result-screen')
        };

        this.elements = {
            // Setup
            levelBtns: document.querySelectorAll('.level-btn'),
            operationBtns: document.querySelectorAll('#operation-select .btn-option'),
            difficultyBtns: document.querySelectorAll('#difficulty-select .btn-option'),
            digitBtns: document.querySelectorAll('#digit-select .btn-option'),
            startBtn: document.getElementById('start-game'),
            levelInfo: document.getElementById('level-info'),

            // Game
            difficultyDisplay: document.getElementById('difficulty-display'),
            levelDisplay: document.getElementById('level-display'),
            livesDisplay: document.getElementById('lives-display'),
            scoreDisplay: document.getElementById('score-display'),
            progressDisplay: document.getElementById('progress-display'),
            gameBoard: document.getElementById('game-board'),
            cardsContainer: document.getElementById('cards-container'),
            backToMenuBtn: document.getElementById('back-to-menu'),
            restartBtn: document.getElementById('restart-game'),

            // Result
            resultTitle: document.getElementById('result-title'),
            finalScore: document.getElementById('final-score'),
            finalLevel: document.getElementById('final-level'),
            accuracy: document.getElementById('accuracy'),
            nextLevelBtn: document.getElementById('next-level'),
            playAgainBtn: document.getElementById('play-again'),
            backToMenuResultBtn: document.getElementById('back-to-menu-result')
        };

        // Selected options
        this.selectedLevel = 3;
        this.selectedOperation = 'mixed';
        this.selectedDifficulty = 'normal';

        this.init();
    }

    /**
     * Initialize the app
     */
    init() {
        this.setupEventListeners();
        this.showScreen('setup');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Level selection
        this.elements.levelBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.elements.levelBtns.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedLevel = parseInt(btn.dataset.level);
                this.updateLevelInfo();
            });
        });

        // Operation selection
        this.elements.operationBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.elements.operationBtns.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedOperation = btn.dataset.value;
            });
        });

        // Difficulty selection
        this.elements.difficultyBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.elements.difficultyBtns.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedDifficulty = btn.dataset.value;
            });
        });

        // Digit selection
        this.elements.digitBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.elements.digitBtns.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedDigits = btn.dataset.value;
            });
        });

        // Start game
        this.elements.startBtn.addEventListener('click', () => {
            this.startGame();
        });

        // Game controls
        this.elements.backToMenuBtn.addEventListener('click', () => {
            this.showScreen('setup');
        });

        this.elements.restartBtn.addEventListener('click', () => {
            this.startGame();
        });

        // Result controls
        this.elements.nextLevelBtn.addEventListener('click', () => {
            this.selectedLevel++;
            this.updateLevelSelection();
            this.startGame();
        });

        this.elements.playAgainBtn.addEventListener('click', () => {
            this.startGame();
        });

        this.elements.backToMenuResultBtn.addEventListener('click', () => {
            this.showScreen('setup');
        });
    }

    /**
     * Update level info text
     */
    updateLevelInfo() {
        const numRaindrops = Math.min(this.selectedLevel, 6);
        this.elements.levelInfo.textContent = `레벨 ${this.selectedLevel}: 동시 빗방울 ${numRaindrops}개`;
    }

    /**
     * Update level selection UI
     */
    updateLevelSelection() {
        this.elements.levelBtns.forEach(btn => {
            btn.classList.remove('selected');
            if (parseInt(btn.dataset.level) === this.selectedLevel) {
                btn.classList.add('selected');
            }
        });
        this.updateLevelInfo();
    }

    /**
     * Show a specific screen
     */
    showScreen(screenName) {
        Object.values(this.screens).forEach(screen => {
            screen.classList.remove('active');
        });
        this.screens[screenName].classList.add('active');
    }

    /**
     * Start the game
     */
    startGame() {
        // Stop any existing game and animation first
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        if (this.game) {
            this.game.stop();
        }

        // Clean up
        this.elements.gameBoard.innerHTML = '';
        this.elements.cardsContainer.innerHTML = '';

        // Show game screen
        this.showScreen('game');

        // Create game instance and setup - batched together for speed
        this.game = new MathRainGame({
            level: this.selectedLevel,
            operation: this.selectedOperation,
            difficulty: this.selectedDifficulty
        });

        // Setup callbacks
        this.game.onScoreUpdate = (score) => {
            this.elements.scoreDisplay.textContent = score;
        };

        this.game.onLivesUpdate = (lives) => {
            this.elements.livesDisplay.textContent = '❤️'.repeat(lives);
        };

        this.game.onProgressUpdate = (solved, total) => {
            this.elements.progressDisplay.textContent = `${solved}/${total}`;
        };

        this.game.onLevelComplete = (result) => {
            this.showResult(true, result);
        };

        this.game.onGameOver = (result) => {
            this.showResult(false, result);
        };

        this.game.onCardsUpdate = () => {
            this.renderCards();
        };

        // Update display
        this.elements.difficultyDisplay.textContent =
            this.selectedDifficulty.charAt(0).toUpperCase() + this.selectedDifficulty.slice(1);
        this.elements.levelDisplay.textContent = this.selectedLevel;

        // Start game (generates problems + raindrops + cards)
        this.game.start();
        
        // Force initial positions for raindrops to be top edge
        this.game.getRaindrops().forEach(r => r.y = 0);

        // Render everything immediately
        this.renderCards();
        this.renderRaindrops();

        // Start animation loop
        this.lastTime = performance.now();
        this.animate();
    }

    /**
     * Animation loop
     */
    animate(currentTime = 0) {
        if (!this.game) return;

        // Ensure we don't have a huge jump from 0
        if (this.lastTime === 0 || currentTime < this.lastTime) {
            this.lastTime = currentTime;
        }

        try {
            const deltaTime = Math.min(currentTime - this.lastTime, 100);
            this.lastTime = currentTime;

            // Update and render raindrops
            this.updateRaindrops(deltaTime);
            this.renderRaindrops();

            // Continue animation
            this.animationFrame = requestAnimationFrame((time) => this.animate(time));
        } catch (error) {
            console.error("Animation error:", error);
            // Optionally stop the game on critical error
            this.game.stop();
        }
    }

    /**
     * Update raindrops position
     */
    updateRaindrops(deltaTime) {
        const raindrops = this.game.getRaindrops();
        // Prevent large jumps if the game starts/resumes after a pause
        const safeDeltaTime = Math.min(deltaTime, 50);

        raindrops.forEach(raindrop => {
            // Move raindrop down with constant speed
            const speedPercentPerMs = 100 / this.game.raindropSpeed;
            raindrop.y += speedPercentPerMs * safeDeltaTime;

            // Check if raindrop reached bottom
            if (raindrop.y >= 90) {
                this.game.raindropMissed(raindrop);
            }
        });
    }

    /**
     * Render raindrops to DOM
     */
    renderRaindrops() {
        const raindrops = this.game.getRaindrops();
        const board = this.elements.gameBoard;

        raindrops.forEach(raindrop => {
            if (!raindrop || !raindrop.problem) return;

            // Efficiently find existing element
            let element = board.querySelector(`[data-id="${raindrop.id}"]`);
            
            if (!element) {
                element = document.createElement('div');
                element.className = 'raindrop';
                element.dataset.id = raindrop.id;
                
                const question = raindrop.problem.question;
                const answer = raindrop.problem.answer;
                const text = (question || (answer !== undefined ? answer + ' = ?' : '문제')) + '';
                element.textContent = text;
                
                // Add three raindrop shape overlays
                for (let i = 0; i < 3; i++) {
                    const dropOverlay = document.createElement('div');
                    dropOverlay.className = 'raindrop-shape';
                    // Position them side-by-side
                    dropOverlay.style.left = (25 + (i * 25)) + '%';
                    element.appendChild(dropOverlay);
                }
                
                element.style.position = 'absolute';
                board.appendChild(element);
            }

            // Update position - Ensure units are present
            element.style.left = raindrop.x + '%';
            // Clamp top position to 0% if negative to prevent off-screen rendering
            element.style.top = Math.max(0, raindrop.y) + '%';

            // Apply warning style if close to bottom
            if (raindrop.y >= 70) {
                element.classList.add('warning');
            } else {
                element.classList.remove('warning');
            }
        });

        // Remove elements that are no longer in the raindrops list
        const raindropIds = new Set(raindrops.map(r => r.id.toString()));
        board.querySelectorAll('.raindrop').forEach(el => {
            if (!raindropIds.has(el.dataset.id)) {
                el.remove();
            }
        });
    }

    /**
     * Render answer cards
     */
    renderCards() {
        if (!this.game) return;

        const cards = this.game.getCards();
        this.elements.cardsContainer.innerHTML = '';

        const grid = document.createElement('div');
        grid.className = 'cards-grid';

        cards.forEach((card, index) => {
            const cardElement = document.createElement('div');
            cardElement.className = 'card';
            if (card.used) {
                cardElement.classList.add('used');
            }
            cardElement.textContent = card.value;
            cardElement.dataset.value = card.value;

            cardElement.addEventListener('click', () => {
                if (!card.used) {
                    this.handleCardClick(card.value, cardElement);
                }
            });

            grid.appendChild(cardElement);
        });

        this.elements.cardsContainer.appendChild(grid);
    }

    /**
     * Handle card click
     */
    handleCardClick(value, element) {
        const result = this.game.selectCard(value);

        if (result) {
            element.classList.add('correct');
            element.classList.add('used');

            setTimeout(() => {
                this.renderCards();
            }, 300);
        } else {
            element.classList.add('wrong');
            setTimeout(() => {
                element.classList.remove('wrong');
            }, 500);
        }
    }

    /**
     * Show result screen
     */
    showResult(success, result) {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        if (success) {
            this.elements.resultTitle.textContent = '🎉 레벨 클리어!';
            this.elements.nextLevelBtn.style.display = 'block';
        } else {
            this.elements.resultTitle.textContent = '💔 게임 오버';
            this.elements.nextLevelBtn.style.display = 'none';
        }

        this.elements.finalScore.textContent = result.score;
        this.elements.finalLevel.textContent = result.level;
        this.elements.accuracy.textContent = (result.accuracy || 0) + '%';

        this.showScreen('result');
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new MathRainApp();
});