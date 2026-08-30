/**
 * AI Player Module
 *
 * Implements an AI opponent with configurable memory difficulty.
 *
 * Difficulty levels:
 * - easy:   No memory. Always picks randomly. Slow reaction.
 * - normal: Remembers only cards the AI itself flipped.
 *           If a known pair exists, ALWAYS match it.
 * - hard:   Remembers ALL cards (AI + human flips).
 *           If a known pair exists, ALWAYS match it. Fast reaction.
 *
 * Strategy:
 *   First pick:  Always random (to gather new info).
 *                EXCEPT: if a complete pair is known, pick from it.
 *   Second pick: Use memory to find the match of the first card.
 *                EXCEPT: if the first card is unknown, check for any known pair.
 */

const AI_DIFFICULTY = {
    easy: {
        label: 'Easy',
        delayMin: 1500,
        delayMax: 2500
    },
    normal: {
        label: 'Normal',
        delayMin: 800,
        delayMax: 1500
    },
    hard: {
        label: 'Hard',
        delayMin: 400,
        delayMax: 900
    }
};

class AIPlayer {
    constructor(difficulty, name = '컴퓨터') {
        this.name = name;
        this.difficulty = difficulty;
        // cardValue -> Set of positions
        this.memory = new Map();
        this.resetMemory();
        this.setDifficulty(difficulty);
    }

    setDifficulty(difficulty) {
        this.difficulty = difficulty;
        const config = AI_DIFFICULTY[difficulty];
        if (!config) {
            console.warn(`Unknown difficulty "${difficulty}", falling back to normal`);
            this.config = AI_DIFFICULTY.normal;
        } else {
            this.config = config;
        }
    }

    resetMemory() {
        this.memory.clear();
    }

    rememberCard(index, value) {
        if (!this.memory.has(value)) {
            this.memory.set(value, new Set());
        }
        this.memory.get(value).add(index);
    }

    forgetCard(value) {
        this.memory.delete(value);
    }

    /**
     * Find a complete pair in memory where both positions are available.
     */
    findCompletePair(unavailablePositions) {
        for (const [value, positions] of this.memory) {
            const available = [];
            for (const pos of positions) {
                if (!unavailablePositions.has(pos)) {
                    available.push(pos);
                }
            }
            if (available.length >= 2) {
                return { value, positions: available };
            }
        }
        return null;
    }

    /**
     * Find a position for a specific value that is not unavailable,
     * excluding a specific index (e.g., the already flipped card).
     */
    findMatchForValue(value, unavailablePositions, excludeIndex) {
        const positions = this.memory.get(value);
        if (!positions) return -1;
        for (const pos of positions) {
            if (pos !== excludeIndex && !unavailablePositions.has(pos)) {
                return pos;
            }
        }
        return -1;
    }

    getThinkDelay() {
        const { delayMin, delayMax } = this.config;
        return delayMin + Math.random() * (delayMax - delayMin);
    }

    /**
     * Decide which card to flip next.
     *
     * @param {number} totalCards
     * @param {Set<number>} flippedIndices
     * @param {Set<number>} matchedIndices
     * @param {number|null} firstPickIndex - index of the first card (if this is the second pick)
     * @returns {number}
     */
    decideMove(totalCards, flippedIndices, matchedIndices, firstPickIndex = null) {
        const unavailable = new Set([...flippedIndices, ...matchedIndices]);

        // Build available cards list
        const available = [];
        for (let i = 0; i < totalCards; i++) {
            if (!unavailable.has(i)) {
                available.push(i);
            }
        }
        if (available.length === 0) return -1;

        // EASY: always random
        if (this.difficulty === 'easy') {
            return available[Math.floor(Math.random() * available.length)];
        }

        // NORMAL / HARD

        // === SECOND PICK ===
        if (firstPickIndex !== null) {
            // Try to find the match for the first card in memory
            for (const [value, positions] of this.memory) {
                if (positions.has(firstPickIndex)) {
                    // Found it! Try to find its pair
                    const match = this.findMatchForValue(value, unavailable, firstPickIndex);
                    if (match !== -1) {
                        return match;
                    }
                    // Pair was already matched or flipped, break out
                    break;
                }
            }

            // First card not in memory, or its pair is gone.
            // Check for any known complete pair to use for this second pick.
            const pair = this.findCompletePair(unavailable);
            if (pair) {
                return pair.positions[0];
            }

            // Nothing in memory - random
            return available[Math.floor(Math.random() * available.length)];
        }

        // === FIRST PICK ===
        // Always prefer a known complete pair
        const pair = this.findCompletePair(unavailable);
        if (pair) {
            return pair.positions[0];
        }

        // No complete pair known. Always pick RANDOM to gather new information.
        // This avoids the infinite loop of picking the same lonely remembered card.
        return available[Math.floor(Math.random() * available.length)];
    }

    /**
     * Process the result of a turn to update AI memory.
     *
     * - easy: never remembers anything
     * - normal: only remembers cards the AI itself flipped
     * - hard: remembers ALL flipped cards
     */
    processTurnResult(index1, value1, index2, value2, isMatch, wasAITurn) {
        if (isMatch) {
            this.forgetCard(value1);
            return;
        }

        // easy: no memory
        if (this.difficulty === 'easy') return;

        // normal: only AI's own flips
        // hard: all flips
        if (this.difficulty === 'hard' || wasAITurn) {
            this.rememberCard(index1, value1);
            this.rememberCard(index2, value2);
        }
    }
}