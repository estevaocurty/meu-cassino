const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const blackjack = require('./src/games/blackjack');
const poker = require('./src/games/poker');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
const salas = {};

function emitirEstadoSeguro(salaId) {
    const sala = salas[salaId];
    if (!sala) return;

    if (sala.tipoJogo === 'poker') {
        sala.jogadores.forEach(jTarget => {
            const salaCensurada = JSON.parse(JSON.stringify(sala));
            if (sala.status !== 'finalizado') {
                salaCensurada.jogadores.forEach(outro => {
                    if (outro.id !== jTarget.id) {
                        outro.mao = outro.mao.map(() => ({ valor: '?', naipe: '?' }));
                    }
                });
            }
            io.to(jTarget.id).emit('estadoDaMesa', salaCensurada);
        });
    } else {
        io.to(salaId).emit('estadoDaMesa', sala);
    }
}

io.on('connection', (socket) => {
    
    socket.on('entrarSala', ({ nome, salaId, tipoJogo, bancaInicial }) => {
        if (!salas[salaId]) {
            salas[salaId] = { 
                id: salaId, 
                tipoJogo, 
                hostId: socket.id,
                bancaInicial: parseFloat(bancaInicial) || 1000,
                jogadores: [], 
                baralho: [], 
                maoBanca: [], 
                status: 'lobby', 
                turnoIndex: 0 
            };
        }

        const sala = salas[salaId];
        const LIMITE_VAGAS = sala.tipoJogo === 'blackjack' ? 7 : 9;

        if (sala.jogadores.length >= LIMITE_VAGAS) {
            socket.emit('erroEntrada', `A mesa está cheia! (Máximo ${LIMITE_VAGAS} jogadores)`);
            return;
        }

        socket.join(salaId);
        sala.jogadores.push({ 
            id: socket.id, 
            nome, 
            fichas: sala.bancaInicial, 
            maos: [], 
            resultado: '' 
        });

        if (sala.tipoJogo === 'blackjack' && sala.status === 'lobby') {
            blackjack.iniciarFaseApostas(sala);
        }

        emitirEstadoSeguro(salaId);
    });

    socket.on('fazerAposta', ({ salaId, apostaPrincipal, sidePP, side21, targetBetBehind, apostaBetBehind }) => {
        const sala = salas[salaId];
        if (!sala || sala.tipoJogo !== 'blackjack') return;
        const j = sala.jogadores.find(p => p.id === socket.id);
        if (!j) return;

        const totalNecessario = apostaPrincipal + sidePP + side21 + apostaBetBehind;
        if (j.fichas >= totalNecessario) {
            j.fichas -= totalNecessario;
            j.apostaPrincipal = apostaPrincipal;
            j.sidePerfectPairs = sidePP;
            j.side21Plus3 = side21;
            j.betBehindTarget = targetBetBehind;
            j.betBehindAposta = apostaBetBehind;
            emitirEstadoSeguro(salaId);
        }
    });

    socket.on('comecarRodada', (salaId) => {
        const sala = salas[salaId];
        if (!sala || socket.id !== sala.hostId) return;
        if (sala.tipoJogo === 'blackjack') blackjack.comecarRodada(sala);
        else if (sala.tipoJogo === 'poker') poker.iniciarJogo(sala);
        emitirEstadoSeguro(salaId);
    });

    socket.on('pedirCarta', (salaId) => {
        const sala = salas[salaId];
        if (sala && sala.tipoJogo === 'blackjack' && blackjack.pedirCarta(sala, socket.id)) emitirEstadoSeguro(salaId);
    });

    socket.on('parar', (salaId) => {
        const sala = salas[salaId];
        if (sala && sala.tipoJogo === 'blackjack' && blackjack.parar(sala, socket.id)) emitirEstadoSeguro(salaId);
    });

    socket.on('dobrar', (salaId) => {
        const sala = salas[salaId];
        if (sala && sala.tipoJogo === 'blackjack' && blackjack.dobrar(sala, socket.id)) emitirEstadoSeguro(salaId);
    });

    socket.on('dividir', (salaId) => {
        const sala = salas[salaId];
        if (sala && sala.tipoJogo === 'blackjack' && blackjack.dividir(sala, socket.id)) emitirEstadoSeguro(salaId);
    });

    socket.on('pokerAcao', ({ salaId, acao, valor }) => {
        const sala = salas[salaId];
        if (sala && sala.tipoJogo === 'poker' && poker.processarAcao(sala, socket.id, acao, valor)) {
            emitirEstadoSeguro(salaId);
        }
    });

    socket.on('disconnect', () => {
        for (const salaId in salas) {
            salas[salaId].jogadores = salas[salaId].jogadores.filter(j => j.id !== socket.id);
            if (salas[salaId].jogadores.length === 0) delete salas[salaId];
            else emitirEstadoSeguro(salaId);
        }
    });
});

const PORTA = process.env.PORT || 3000;
server.listen(PORTA, () => console.log(`Servidor rodando na porta ${PORTA}`));