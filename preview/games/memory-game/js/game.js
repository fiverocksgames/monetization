/**
 * Core Game Engine
 *
 * Manages the game state, turn logic, matching, and scoring.
 * Works for both PvP and AI modes.
 */

class MemoryGame {
    /**
     * @param {object} config
     * @param {number} config.gridSize - 4, 6, or 8
     * @param {string} config.theme - Theme key
     * @param {string} config.mode - 'ai' or 'pvp'
     * @param {string} config.difficulty - 'easy', 'normal', 'hard' (only for AI mode)
     * @param {string} config.player1Name
     * @param {string} config.player2Name
     */
    constructor(config) {
        this.gridSize = config.gridSize;
        this.totalCards = config.gridSize * config.gridSize;
        this.mode = config.mode;
        this.difficulty = config.difficulty || 'normal';
        this.theme = config.theme || 'animals';
        this.playerNames = [config.player1Name || '플레이어 1', config.player2Name || '플레이어 2'];

        // Game state
        this.cards = [];
        this.currentPlayer = 0;
        this.scores = [0, 0];
        this.flippedIndices = [];
        this.matchedIndices = new Set();
        this.isLocked = false;
        this.isGameOver = false;
        this.totalPairs = this.totalCards / 2;
        this.matchedPairs = 0;
        this.turnCount = 0;

        // AI instance
        this.ai = null;
        if (this.mode === 'ai') {
            this.ai = new AIPlayer(this.difficulty, this.playerNames[1]);
            this.aiTurnInProgress = false;
        }

        // Callbacks
        this.onCardFlip = null;
        this.onMatch = null;
        this.onMismatch = null;
        this.onTurnChange = null;
        this.onScoreChange = null;
        this.onGameOver = null;
        this.onAIThinking = null;
        this.onAIMove = null;

        this.initCards();
    }

    /**
     * Initialize and shuffle the card deck using the selected theme
     */
    initCards() {
        const deck = getThemeCards(this.theme, this.gridSize);
        this.cards = deck.map(value => ({
            value: value,
            matched: false,
            flipped: false
        }));
    }

    /**
     * Get the value of a card at a given index
     */
    getCardValue(index) {
        return this.cards[index].value;
    }

    /**
     * Check if a card is already matched
     */
    isCardMatched(index) {
        return this.matchedIndices.has(index);
    }

    /**
     * Check if a card is currently flipped
     */
    isCardFlipped(index) {
        return this.flippedIndices.includes(index);
    }

    /**
     * Handle a card flip by the current player
     * @param {number} index - Card index to flip
     * @returns {boolean} Whether the flip was valid
     */
    flipCard(index) {
        // Validation
        if (this.isLocked) return false;
        if (this.isGameOver) return false;
        if (this.matchedIndices.has(index)) return false;
        if (this.flippedIndices.includes(index)) return false;
        if (this.flippedIndices.length >= 2) return false;

        // In AI mode, block human clicks during AI's turn
        // AI uses flipCard internally, so we need to allow AI-initiated flips
        if (this.mode === 'ai' && this.currentPlayer === 1 && !this.aiTurnInProgress) return false;

        // Flip the card
        this.cards[index].flipped = true;
        this.flippedIndices.push(index);

        if (this.onCardFlip) {
            this.onCardFlip(index, this.cards[index].value);
        }

        // Immediately notify AI about this card flip so it can use the info
        // for its second pick or for future turns.
        //   - hard mode: learn ALL flipped cards (human + AI)
        //   - normal mode: learn only AI's own flips
        //   - easy mode: never learns
        if (this.ai) {
            const isAITurn = this.currentPlayer === 1;
            if (this.difficulty === 'hard' || (this.difficulty === 'normal' && isAITurn)) {
                this.ai.rememberCard(index, this.cards[index].value);
            }
        }

        // If this is the second flip, check for a match
        if (this.flippedIndices.length === 2) {
            this.isLocked = true;
            this.turnCount++;
            this.checkMatch();
        }

        return true;
    }

    /**
     * Check if the two flipped cards match
     */
    checkMatch() {
        const [idx1, idx2] = this.flippedIndices;
        const val1 = this.cards[idx1].value;
        const val2 = this.cards[idx2].value;

        if (val1 === val2) {
            // Match found
            setTimeout(() => this.handleMatch(idx1, idx2, val1), 500);
        } else {
            // No match
            setTimeout(() => this.handleMismatch(idx1, idx2, val1, val2), 800);
        }
    }

    /**
     * Handle a successful match
     */
    handleMatch(idx1, idx2, value) {
        this.cards[idx1].matched = true;
        this.cards[idx2].matched = true;
        this.matchedIndices.add(idx1);
        this.matchedIndices.add(idx2);
        this.scores[this.currentPlayer]++;
        this.matchedPairs++;

        if (this.onScoreChange) {
            this.onScoreChange(this.currentPlayer, this.scores[this.currentPlayer]);
        }
        if (this.onMatch) {
            this.onMatch(idx1, idx2, value);
        }

        // Notify AI about the match
        if (this.ai) {
            this.ai.processTurnResult(idx1, value, idx2, value, true, this.currentPlayer === 1);
        }

        this.flippedIndices = [];

        // Check for game over
        if (this.matchedPairs === this.totalPairs) {
            this.isGameOver = true;
            this.isLocked = false;
            if (this.onGameOver) {
                const winner = this.determineWinner();
                this.onGameOver(winner, this.scores);
            }
            return;
        }

        // Current player gets another turn (stays same)
        this.isLocked = false;

        // If in AI mode and it's AI's turn, trigger AI move
        if (this.mode === 'ai' && this.currentPlayer === 1) {
            this.scheduleAIMove();
        }
    }

    /**
     * Handle a mismatch
     */
    handleMismatch(idx1, idx2, val1, val2) {
        this.cards[idx1].flipped = false;
        this.cards[idx2].flipped = false;

        if (this.onMismatch) {
            this.onMismatch(idx1, idx2, val1, val2);
        }

        // Notify AI about the mismatch
        if (this.ai && this.mode === 'ai') {
            this.ai.processTurnResult(idx1, val1, idx2, val2, false, this.currentPlayer === 1);
        }

        this.flippedIndices = [];

        // Switch turns
        this.switchTurn();
    }

    /**
     * Switch to the next player
     */
    switchTurn() {
        this.currentPlayer = this.currentPlayer === 0 ? 1 : 0;
        this.isLocked = false;

        if (this.onTurnChange) {
            this.onTurnChange(this.currentPlayer);
        }

        // If AI mode and it's AI's turn, schedule AI move
        if (this.mode === 'ai' && this.currentPlayer === 1) {
            this.scheduleAIMove();
        }
    }

    /**
     * Schedule the AI's next move after a thinking delay
     */
    scheduleAIMove() {
        if (!this.ai) return;

        this.isLocked = true;
        if (this.onAIThinking) {
            this.onAIThinking();
        }

        const delay = this.ai.getThinkDelay();
        setTimeout(() => this.performAIMove(), delay);
    }

    /**
     * Execute the AI's move
     */
    performAIMove() {
        if (this.isGameOver) return;

        const flippedSet = new Set(this.flippedIndices);
        const firstPick = this.flippedIndices.length === 1 ? this.flippedIndices[0] : null;

        const index = this.ai.decideMove(
            this.totalCards,
            flippedSet,
            this.matchedIndices,
            firstPick
        );

        if (index === -1) {
            this.isLocked = false;
            return;
        }

        if (this.onAIMove) {
            this.onAIMove(index);
        }

        // Mark that AI is making a move so flipCard allows it
        this.aiTurnInProgress = true;
        this.isLocked = false;
        this.flipCard(index);
        this.aiTurnInProgress = false;

        // If only 1 card has been flipped, schedule the second flip
        if (this.flippedIndices.length === 1 && !this.isGameOver) {
            const delay = this.ai.getThinkDelay() * 0.6;
            setTimeout(() => {
                if (!this.isGameOver) {
                    this.performAIMove();
                }
            }, delay);
        }
    }

    /**
     * Determine the winner of the game
     * @returns {number|null} Index of winning player, or -1 for draw
     */
    determineWinner() {
        if (this.scores[0] > this.scores[1]) return 0;
        if (this.scores[1] > this.scores[0]) return 1;
        return -1; // Draw
    }
}