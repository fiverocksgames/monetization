/**
 * Math Rain - Game Engine
 * Manages game logic, problem generation, raindrops, and scoring
 */

class MathRainGame {
    constructor(config) {
        this.level = config.level || 1;
        this.operation = config.operation || 'mixed';
        this.difficulty = config.difficulty || 'normal';
        this.digits = config.digits || '1'; // '1', '2', '3'

        // Game state
        this.score = 0;
        this.lives = 3;
        this.problemsSolved = 0;
        this.totalAttempts = 0; // Track total attempts for accuracy
        this.totalProblems = config.level * 10; // Level 1=10, Level 2=20, Level 3=30, etc.
        this.combo = 0;
        this.maxCombo = 0;

        // Problems and cards
        this.currentProblems = [];
        this.availableCards = [];
        this.usedCards = new Set();

        // Raindrops
        this.raindrops = [];
        this.raindropId = 0;

        // Timing
        this.gameInterval = null;
        this.raindropSpeed = this.getSpeed();

        // Callbacks
        this.onScoreUpdate = null;
        this.onLivesUpdate = null;
        this.onProgressUpdate = null;
        this.onGameOver = null;
        this.onLevelComplete = null;
        this.onCardsUpdate = null;

        // Game over flag
        this.isGameOver = false;
    }

    /**
     * Get raindrop fall speed based on difficulty
     */
    getSpeed() {
        switch(this.difficulty) {
            case 'easy': return 40000; // 40 seconds
            case 'normal': return 25000; // 25 seconds
            case 'hard': return 15000; // 15 seconds
            default: return 25000;
        }
    }

    /**
     * Get number range based on level and digit setting
     */
    getNumberRange() {
        // digit '1': 1-digit + 1-digit (1-9)
        // digit '2': 2-digit + 1-digit (10-99 + 1-9)
        // digit '3': 2-digit + 2-digit (10-99 + 10-99)
        
        if (this.digits === '1') return { min: 1, max: 9 };
        if (this.digits === '2') return { min1: 10, max1: 99, min2: 1, max2: 9 };
        return { min: 10, max: 99 };
    }

    /**
     * Generate a random math problem
     */
    generateProblem() {
        const range = this.getNumberRange();
        const operations = this.getOperations();
        let operation = operations[Math.floor(Math.random() * operations.length)];

        // Default to 'add' if operation is somehow invalid
        if (!operation) {
            operation = 'add';
        }

        let num1, num2, answer, question;

        const getNum = (r) => {
            if (this.digits === '2') {
                return { 
                    n1: this.randomInt(r.min1, r.max1), 
                    n2: this.randomInt(r.min2, r.max2) 
                };
            }
            if (this.digits === '3') {
                return { 
                    n1: this.randomInt(r.min, r.max), 
                    n2: this.randomInt(r.min, r.max) 
                };
            }
            // Default digit '1'
            return { 
                n1: this.randomInt(r.min, r.max), 
                n2: this.randomInt(r.min, r.max) 
            };
        };

        switch(operation) {
            case 'add':
                const addNums = getNum(range);
                num1 = addNums.n1;
                num2 = addNums.n2;
                answer = num1 + num2;
                question = `${num1} + ${num2} = ?`;
                break;
            case 'sub':
                const subNums = getNum(range);
                num1 = subNums.n1;
                num2 = subNums.n2;
                // Ensure num1 >= num2 for simple subtraction
                if (num1 < num2) [num1, num2] = [num2, num1];
                answer = num1 - num2;
                question = `${num1} - ${num2} = ?`;
                break;
            case 'mul':
                num1 = this.randomInt(1, 9);
                num2 = this.randomInt(1, 9);
                answer = num1 * num2;
                question = `${num1} × ${num2} = ?`;
                break;
            case 'div':
                num2 = this.randomInt(1, 9);
                answer = this.randomInt(1, 9);
                num1 = num2 * answer;
                question = `${num1} ÷ ${num2} = ?`;
                break;
            default:
                const defNums = getNum(range);
                num1 = defNums.n1;
                num2 = defNums.n2;
                answer = num1 + num2;
                question = `${num1} + ${num2} = ?`;
                break;
        }

        return {
            id: Date.now() + Math.random(),
            question: question || `${answer} = ?`,
            answer: answer || 0,
            operation: operation
        };
    }

    /**
     * Get available operations based on level and selection
     */
    getOperations() {
        if (this.operation === 'mixed') {
            if (this.level >= 7) {
                return ['add', 'sub', 'mul', 'div'];
            } else if (this.level >= 4) {
                return ['add', 'sub', 'mul'];
            }
            return ['add', 'sub']; // Level 1-3: only add and sub
        }
        return [this.operation];
    }

    /**
     * Generate random integer between min and max (inclusive)
     */
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Start the game
     */
    start() {
        console.time('GameStart');
        this.score = 0;
        this.lives = 3;
        this.problemsSolved = 0;
        this.totalAttempts = 0; // Reset total attempts
        this.combo = 0;
        this.maxCombo = 0;
        this.raindrops = [];
        this.usedCards = new Set();
        this.isGameOver = false;
        this.raindropId = 0;

        // Generate initial problems
        this.generateProblems();

        // Start raindrop spawning
        this.startRaindrops();
        console.timeEnd('GameStart');

        // Notify UI
        if (this.onScoreUpdate) this.onScoreUpdate(this.score);
        if (this.onLivesUpdate) this.onLivesUpdate(this.lives);
        if (this.onProgressUpdate) this.onProgressUpdate(this.problemsSolved, this.totalProblems);
    }

    /**
     * Generate problems for current level
     */
    generateProblems() {
        this.currentProblems = [];
        // Allow up to 10 simultaneous problems for level 10+
        const numProblems = Math.min(this.level, 10);
        const usedAnswers = new Set();

        while (this.currentProblems.length < numProblems) {
            const problem = this.generateProblem();
            // Only add if answer is unique
            if (!usedAnswers.has(problem.answer)) {
                usedAnswers.add(problem.answer);
                this.currentProblems.push(problem);
            }
        }

        // Generate answer cards (more cards than problems)
        this.generateCards();
    }

    /**
     * Generate answer cards
     */
    generateCards() {
        const answers = this.currentProblems.map(p => p.answer);
        const numCards = answers.length * 2; // Exactly 2x the number of problems

        // Start with all correct answers (these are guaranteed to be valid)
        this.availableCards = [...answers];

        // Add wrong answers until we have exactly 2x the problems
        while (this.availableCards.length < numCards) {
            const wrongAnswer = this.generateWrongAnswer();
            // Only add if it's a valid number
            if (!isNaN(wrongAnswer) && isFinite(wrongAnswer)) {
                this.availableCards.push(wrongAnswer);
            }
        }

        // Ensure all answers are still present (they should be, but double-check)
        const answersSet = new Set(answers);
        this.availableCards = this.availableCards.filter(card => {
            const num = Number(card);
            return (!isNaN(num) && isFinite(num));
        });

        // Make sure all correct answers are still in the deck
        answers.forEach(answer => {
            if (!this.availableCards.includes(answer)) {
                this.availableCards.push(answer);
            }
        });

        // If we have too many cards, remove some wrong answers
        while (this.availableCards.length > numCards) {
            // Find a wrong answer (not in answersSet) and remove it
            const index = this.availableCards.findIndex(card => !answersSet.has(card));
            if (index > -1) {
                this.availableCards.splice(index, 1);
            } else {
                break;
            }
        }

        // If we still don't have enough cards, add random numbers
        while (this.availableCards.length < numCards) {
            this.availableCards.push(this.randomInt(1, 50));
        }

        // Sort cards in ascending order
        this.availableCards.sort((a, b) => a - b);

        this.usedCards = new Set();

        // Notify UI to update cards
        if (this.onCardsUpdate) {
            this.onCardsUpdate();
        }
    }

    /**
     * Generate a wrong answer close to real answers
     */
    generateWrongAnswer() {
        const answers = this.currentProblems.map(p => p.answer);

        // Safety check: if no answers available, return a random number
        if (answers.length === 0) {
            return this.randomInt(1, 20);
        }

        const baseAnswer = answers[Math.floor(Math.random() * answers.length)];

        // Try up to 10 times to generate a valid wrong answer
        for (let attempt = 0; attempt < 10; attempt++) {
            const offset = this.randomInt(-5, 5);
            let wrongAnswer = baseAnswer + offset;

            // Make sure it's positive and not equal to any real answer
            if (wrongAnswer > 0 && !answers.includes(wrongAnswer)) {
                return wrongAnswer;
            }
        }

        // If all attempts failed, return a random number that's not in answers
        // Use a simpler approach to avoid infinite loop
        const randomAnswer = this.randomInt(1, 100);
        if (!answers.includes(randomAnswer)) {
            return randomAnswer;
        }

        // Last resort: return baseAnswer + 10 (guaranteed to be different in most cases)
        return baseAnswer + 10;
    }

    /**
     * Shuffle array (Fisher-Yates)
     */
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    /**
     * Start spawning raindrops
     */
    startRaindrops() {
        // Spawn initial raindrops
        this.currentProblems.forEach(problem => {
            this.spawnRaindrop(problem);
        });

        // Continuously spawn new raindrops
        this.gameInterval = setInterval(() => {
            this.updateRaindrops();
        }, 1000);
    }

    /**
     * Spawn a raindrop with a problem
     */
    spawnRaindrop(problem) {
        const raindrop = {
            id: this.raindropId++,
            problem: problem,
            element: null,
            x: this.randomInt(10, 80), // Percentage
            y: 0, // Start exactly at the top edge
            solved: false
        };

        this.raindrops.push(raindrop);
        return raindrop;
    }

    /**
     * Update raindrops (called every second)
     */
    updateRaindrops() {
        // Remove solved raindrops from the array
        this.raindrops = this.raindrops.filter(r => !r.solved);

        if (this.raindrops.length === 0) {
            // All problems solved, generate new ones
            this.generateProblems();
            this.currentProblems.forEach(problem => {
                this.spawnRaindrop(problem);
            });
        }
    }

    /**
     * Move raindrop down
     */
    moveRaindrop(raindrop) {
        const speed = this.raindropSpeed / 100; // pixels per 100ms
        raindrop.y += speed;

        // Check if raindrop reached bottom
        if (raindrop.y >= 100) {
            this.raindropMissed(raindrop);
            return false;
        }

        return true;
    }

    /**
     * Handle raindrop reaching bottom (missed)
     */
    raindropMissed(raindrop) {
        if (raindrop.solved) return;

        this.lives--;
        this.combo = 0;

        if (this.onLivesUpdate) {
            this.onLivesUpdate(this.lives);
        }

        // Remove raindrop
        this.removeRaindrop(raindrop);

        // Check game over
        if (this.lives <= 0) {
            this.gameOver();
        }
    }

    /**
     * Remove raindrop from array
     */
    removeRaindrop(raindrop) {
        const index = this.raindrops.indexOf(raindrop);
        if (index > -1) {
            this.raindrops.splice(index, 1);
        }
    }

    /**
     * Handle card click
     */
    selectCard(cardValue) {
        // Find unsolved raindrop with matching answer
        const matchingRaindrop = this.raindrops.find(r =>
            r.problem.answer === cardValue && !r.solved
        );

        if (matchingRaindrop) {
            // Correct answer!
            matchingRaindrop.solved = true;
            this.problemsSolved++;
            this.totalAttempts++; // Increment total attempts
            this.combo++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);

            // Calculate score
            const baseScore = 100;
            const comboBonus = Math.min(this.combo * 10, 100);
            this.score += baseScore + comboBonus;

            // Remove raindrop after animation
            setTimeout(() => {
                this.removeRaindrop(matchingRaindrop);

                // Check if we need new problems immediately (don't wait for interval)
                if (this.raindrops.length === 0 && !this.isGameOver && this.problemsSolved < this.totalProblems) {
                    this.generateProblems();
                    this.currentProblems.forEach(problem => {
                        this.spawnRaindrop(problem);
                    });
                    // Notify UI to update cards
                    if (this.onCardsUpdate) {
                        this.onCardsUpdate();
                    }
                }
            }, 300);

            // Mark card as used
            this.usedCards.add(cardValue);

            // Update UI
            if (this.onScoreUpdate) this.onScoreUpdate(this.score);
            if (this.onProgressUpdate) {
                this.onProgressUpdate(this.problemsSolved, this.totalProblems);
            }

            // Check level complete
            if (this.problemsSolved >= this.totalProblems) {
                this.levelComplete();
            }

            return true;
        } else {
            // Wrong answer
            this.totalAttempts++; // Increment total attempts
            this.combo = 0;
            
            // Time Penalty: Speed up all raindrops by 5%
            this.raindrops.forEach(r => {
                if (!r.solved) {
                    r.y += 5; // Move down 5%
                }
            });
            
            return false;
        }
    }

    /**
     * Handle level complete
     */
    levelComplete() {
        this.stop();

        if (this.onLevelComplete) {
            // Calculate accuracy: (correct problems / total attempts)
            const accuracy = this.totalAttempts > 0 
                ? Math.round((this.problemsSolved / this.totalAttempts) * 100) 
                : 100;
                
            this.onLevelComplete({
                score: this.score,
                level: this.level,
                accuracy: accuracy,
                maxCombo: this.maxCombo
            });
        }
    }

    /**
     * Handle game over
     */
    gameOver() {
        this.stop();

        if (this.onGameOver) {
            this.onGameOver({
                score: this.score,
                level: this.level,
                problemsSolved: this.problemsSolved
            });
        }
    }

    /**
     * Stop the game
     */
    stop() {
        if (this.gameInterval) {
            clearInterval(this.gameInterval);
            this.gameInterval = null;
        }
    }

    /**
     * Get current raindrops for rendering
     */
    getRaindrops() {
        return this.raindrops.filter(r => !r.solved);
    }

    /**
     * Get available cards
     */
    getCards() {
        return this.availableCards.map((value, index) => ({
            value: value,
            used: this.usedCards.has(value)
        }));
    }
}