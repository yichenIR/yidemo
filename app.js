// 初始化 GUN
const gun = Gun({
    peers: ['https://gun-manhattan.herokuapp.com/gun'] // 使用公共的 relay peer
});

// 遊戲常量
const GAME_STATES = {
    WAITING: 'waiting',
    NIGHT: 'night',
    DAY: 'day',
    VOTING: 'voting'
};

const ROLES = {
    VILLAGER: '村民',
    WEREWOLF: '狼人',
    SEER: '預言家',
    WITCH: '女巫'
};

// 遊戲類
class WerewolfGame {
    constructor() {
        this.currentPlayer = null;
        this.currentRoom = null;
        this.gun = gun;
        this.localMessages = [];  // 新增本地訊息陣列
        this.messageSet = new Set(); // 用來追蹤已顯示的訊息
        this.setupListeners();
    }

    // 初始化事件監聽器
    setupListeners() {
        document.getElementById('loginBtn').addEventListener('click', () => this.login());
        document.getElementById('createRoomBtn').addEventListener('click', () => this.showCreateRoomDialog());
        document.getElementById('joinRoomBtn').addEventListener('click', () => this.joinRoom());
        document.getElementById('sendMessage').addEventListener('click', () => this.sendMessage());
        document.getElementById('confirmCreateRoom').addEventListener('click', () => this.handleCreateRoom());
        document.getElementById('cancelCreateRoom').addEventListener('click', () => this.hideCreateRoomDialog());
        document.getElementById('startGameBtn').addEventListener('click', () => this.startGame());
        document.getElementById('copyRoomCode').addEventListener('click', () => this.copyRoomCode());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
    }

    // 生成6位數字房間代碼
    generateRoomCode() {
        const numbers = '123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += numbers.charAt(Math.floor(Math.random() * numbers.length));
        }
        return code;
    }

    // 顯示創建房間對話框
    showCreateRoomDialog() {
        const roomCode = this.generateRoomCode();
        document.getElementById('generatedRoomCode').textContent = roomCode;
        document.getElementById('roomNameInput').value = '';
        document.getElementById('createRoomDialog').classList.remove('hidden');
    }

    // 隱藏創建房間對話框
    hideCreateRoomDialog() {
        document.getElementById('createRoomDialog').classList.add('hidden');
    }

    // 處理創建房間
    handleCreateRoom() {
        const roomCode = document.getElementById('generatedRoomCode').textContent;
        const roomName = document.getElementById('roomNameInput').value.trim() || `${this.currentPlayer.name}的房間`;
        
        const room = {
            id: roomCode,
            name: roomName,
            host: this.currentPlayer.id,
            players: [this.currentPlayer],
            state: GAME_STATES.WAITING,
            messages: []
        };

        this.gun.get('rooms').get(roomCode).put(room);
        this.hideCreateRoomDialog();
        this.joinRoom(roomCode);
    }

    // 登入
    login() {
        const playerName = document.getElementById('playerName').value.trim();
        if (!playerName) {
            alert('請輸入名字！');
            return;
        }
        this.currentPlayer = {
            id: `player_${Date.now()}`,
            name: playerName,
            role: null
        };
        this.showSection('lobbySection');
        this.updateRoomList();
    }

    // 建立房間
    createRoom() {
        const roomId = `room_${Date.now()}`;
        const room = {
            id: roomId,
            name: `${this.currentPlayer.name}的房間`,
            host: this.currentPlayer.id,
            players: [this.currentPlayer],
            state: GAME_STATES.WAITING,
            messages: []
        };

        this.gun.get('rooms').get(roomId).put(room);
        this.joinRoom(roomId);
    }

    // 加入房間
    joinRoom(roomId) {
        roomId = roomId || document.getElementById('roomCode').value;
        if (!roomId) {
            alert('請輸入房間代碼！');
            return;
        }

        this.currentRoom = roomId;
        this.localMessages = [];
        this.messageSet.clear();
        
        // 顯示房間代碼
        document.getElementById('currentRoomCode').textContent = roomId;

        this.gun.get('rooms').get(roomId).on((room) => {
            if (!room) return;
            
            // 更新房間信息
            document.getElementById('roomName').textContent = room.name;
            this.updatePlayersList(room.players);
            this.updateGameStatus(room.state);
            
            // 顯示或隱藏開始遊戲按鈕
            const startGameBtn = document.getElementById('startGameBtn');
            if (room.host === this.currentPlayer.id && room.state === GAME_STATES.WAITING) {
                startGameBtn.classList.remove('hidden');
            } else {
                startGameBtn.classList.add('hidden');
            }

            // 檢查是否自動開始遊戲
            if (room.players && room.players.length >= 4 && room.state === GAME_STATES.WAITING) {
                if (room.host === this.currentPlayer.id) {
                    this.startGame();
                }
            }

            // 如果遊戲已開始，顯示角色信息
            if (room.state !== GAME_STATES.WAITING) {
                this.showRole(room.players);
            }
        });

        // 獲取房間的所有歷史訊息
        this.gun.get('rooms').get(roomId).get('messages').map().once((msg, key) => {
            if (msg && !this.messageSet.has(msg.timestamp)) {
                this.messageSet.add(msg.timestamp);
                this.localMessages.push(msg);
                this.displayMessages();
            }
        });

        // 監聽新訊息
        this.gun.get('rooms').get(roomId).get('messages').map().on((msg, key) => {
            if (msg && !this.messageSet.has(msg.timestamp)) {
                this.messageSet.add(msg.timestamp);
                this.localMessages.push(msg);
                this.displayMessages();
            }
        });

        this.showSection('gameSection');
    }

    // 發送消息
    sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        if (!message) return;

        const newMessage = {
            sender: this.currentPlayer.name,
            content: message,
            timestamp: Date.now(),
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        // 發送到 GUN
        this.gun.get('rooms').get(this.currentRoom).get('messages')
            .get(newMessage.id)
            .put(newMessage);

        input.value = '';
    }

    // 發送系統消息
    sendSystemMessage(content) {
        const message = {
            sender: 'System',
            content: content,
            timestamp: Date.now(),
            system: true,
            id: `sys_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        // 發送到 GUN
        this.gun.get('rooms').get(this.currentRoom).get('messages')
            .get(message.id)
            .put(message);
    }

    // 開始遊戲
    startGame() {
        const roomRef = this.gun.get('rooms').get(this.currentRoom);
        
        roomRef.once((room) => {
            if (!room || !room.players || room.players.length < 4) {
                alert('需要至少4位玩家才能開始遊戲！');
                return;
            }

            // 分配角色
            const players = [...room.players];
            const roles = this.generateFixedRoles(players.length);
            const updatedPlayers = players.map((player, index) => ({
                ...player,
                role: roles[index]
            }));

            // 更新遊戲狀態和玩家角色
            roomRef.put({
                ...room,
                state: GAME_STATES.NIGHT,
                players: updatedPlayers
            });

            // 發送系統消息
            this.sendSystemMessage('遊戲開始！請查看您的角色。');
        });
    }

    // 生成固定角色配置（4人場）
    generateFixedRoles(playerCount) {
        const roles = [
            ROLES.WEREWOLF,    // 1狼人
            ROLES.SEER,        // 1預言家
            ROLES.VILLAGER,    // 2平民
            ROLES.VILLAGER
        ];
        return this.shuffleArray(roles);
    }

    // 分配角色
    assignRoles(players) {
        const roles = this.generateRoles(players.length);
        const updatedPlayers = players.map((player, index) => ({
            ...player,
            role: roles[index]
        }));

        this.gun.get('rooms').get(this.currentRoom).get('players')
            .put(updatedPlayers);
    }

    // 根據玩家數量生成角色
    generateRoles(playerCount) {
        const roles = [];
        // 基本配置：每3個人1個狼人，1個預言家，1個女巫
        const werewolfCount = Math.floor(playerCount / 3);
        roles.push(...Array(werewolfCount).fill(ROLES.WEREWOLF));
        roles.push(ROLES.SEER);
        roles.push(ROLES.WITCH);
        
        // 剩下的都是村民
        while (roles.length < playerCount) {
            roles.push(ROLES.VILLAGER);
        }

        // 打亂角色順序
        return this.shuffleArray(roles);
    }

    // 打亂數組
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // 更新玩家列表
    updatePlayersList(players) {
        const list = document.getElementById('playersList');
        list.innerHTML = players.map(player => `
            <div class="player">
                <span>${player.name}</span>
                ${player.role ? `<span class="role">(${player.role})</span>` : ''}
            </div>
        `).join('');
    }

    // 更新遊戲狀態
    updateGameStatus(state) {
        const statusEl = document.getElementById('gameStatus');
        const stateText = {
            [GAME_STATES.WAITING]: '等待開始',
            [GAME_STATES.NIGHT]: '夜晚階段',
            [GAME_STATES.DAY]: '白天階段',
            [GAME_STATES.VOTING]: '投票階段'
        }[state];

        statusEl.textContent = stateText;
    }

    // 更新消息列表
    updateMessages(messages) {
        const container = document.getElementById('chatMessages');
        if (!Array.isArray(messages)) return;

        container.innerHTML = messages
            .sort((a, b) => a.timestamp - b.timestamp)
            .map(msg => `
                <div class="message ${msg.system ? 'system-message' : 'player-message'}">
                    <strong>${msg.sender}:</strong> ${msg.content}
                </div>
            `).join('');
        
        container.scrollTop = container.scrollHeight;
    }

    // 顯示訊息（新方法）
    displayMessages() {
        const container = document.getElementById('chatMessages');
        if (!this.localMessages.length) return;

        const sortedMessages = [...this.localMessages].sort((a, b) => a.timestamp - b.timestamp);

        container.innerHTML = sortedMessages.map(msg => `
            <div class="message ${msg.system ? 'system-message' : 'player-message'}">
                <div class="message-header">
                    <strong>${msg.sender}</strong>
                    <span class="message-time">${this.formatTime(msg.timestamp)}</span>
                </div>
                <div class="message-content">${msg.content}</div>
            </div>
        `).join('');
        
        container.scrollTop = container.scrollHeight;
    }

    // 格式化時間
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    // 顯示指定區段
    showSection(sectionId) {
        document.querySelectorAll('.section').forEach(section => {
            section.classList.add('hidden');
        });
        document.getElementById(sectionId).classList.remove('hidden');
    }

    // 更新房間列表
    updateRoomList() {
        this.gun.get('rooms').map().on((room, id) => {
            if (!room) return;
            const list = document.getElementById('roomList');
            const roomDiv = document.createElement('div');
            roomDiv.className = 'room-item';
            roomDiv.innerHTML = `
                <span>${room.name}</span>
                <span>(${room.players?.length || 0}人)</span>
                <button onclick="game.joinRoom('${id}')">加入</button>
            `;
            list.appendChild(roomDiv);
        });
    }

    // 顯示玩家角色
    showRole(players) {
        const currentPlayerRole = players.find(p => p.id === this.currentPlayer.id)?.role;
        const roleInfo = document.getElementById('roleInfo');
        
        if (currentPlayerRole) {
            roleInfo.innerHTML = `
                <div class="role-display">
                    <h3>您的角色</h3>
                    <p class="role-name">${currentPlayerRole}</p>
                </div>
            `;
        }
    }

    // 複製房間代碼
    async copyRoomCode() {
        const roomCode = document.getElementById('currentRoomCode').textContent;
        try {
            await navigator.clipboard.writeText(roomCode);
            this.sendSystemMessage('房間代碼已複製到剪貼簿');
        } catch (err) {
            this.sendSystemMessage('無法複製房間代碼');
        }
    }
}

// 初始化遊戲
const game = new WerewolfGame();
window.game = game; // 為了讓按鈕可以訪問到 game 實例