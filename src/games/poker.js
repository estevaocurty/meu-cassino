const Hand = require('pokersolver').Hand;

const naipes = ['s', 'h', 'd', 'c'];
const valores = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

function criarBaralho() {
    let baralho = [];
    for (let n of naipes) for (let v of valores) baralho.push({ valor: v, naipe: n });
    return baralho.sort(() => Math.random() - 0.5);
}

function checarFimRodadaApostas(sala) {
    const ativos = sala.jogadores.filter(j => !j.desistiu && !j.allIn);
    if (ativos.length === 0) return true; 
    
    const todosAgiram = ativos.every(j => j.agiuNestaRodada);
    const apostasIguais = ativos.every(j => j.apostaAtual === sala.apostaMesa);
    
    if (ativos.length === 1 && apostasIguais) return true;
    return todosAgiram && apostasIguais;
}

function avancarTurno(sala) {
    if (checarFimRodadaApostas(sala)) {
        proximaFase(sala);
        return;
    }

    let tentativas = 0;
    do {
        sala.turnoIndex = (sala.turnoIndex + 1) % sala.jogadores.length;
        tentativas++;
    } while ((sala.jogadores[sala.turnoIndex].desistiu || sala.jogadores[sala.turnoIndex].allIn) && tentativas < sala.jogadores.length);

    const naoDesistiram = sala.jogadores.filter(j => !j.desistiu);
    if (naoDesistiram.length === 1) {
        naoDesistiram[0].fichas += sala.pote;
        naoDesistiram[0].resultado = `Venceu! (+${sala.pote})`;
        sala.status = 'finalizado';
    }
}

function proximaFase(sala) {
    sala.jogadores.forEach(j => {
        j.apostaAtual = 0;
        j.agiuNestaRodada = false;
    });
    sala.apostaMesa = 0;

    sala.turnoIndex = sala.dealerIndex;
    let tentativas = 0;
    do {
        sala.turnoIndex = (sala.turnoIndex + 1) % sala.jogadores.length;
        tentativas++;
    } while ((sala.jogadores[sala.turnoIndex].desistiu || sala.jogadores[sala.turnoIndex].allIn) && tentativas < sala.jogadores.length);

    if (sala.fase === 'pre-flop') {
        sala.fase = 'flop';
        sala.cartasComunitarias = [sala.baralho.pop(), sala.baralho.pop(), sala.baralho.pop()];
    } else if (sala.fase === 'flop') {
        sala.fase = 'turn';
        sala.cartasComunitarias.push(sala.baralho.pop());
    } else if (sala.fase === 'turn') {
        sala.fase = 'river';
        sala.cartasComunitarias.push(sala.baralho.pop());
    } else if (sala.fase === 'river') {
        sala.fase = 'showdown';
        finalizarRodada(sala);
        return;
    }
    
    const ativos = sala.jogadores.filter(j => !j.desistiu && !j.allIn);
    if (ativos.length <= 1) {
        while (sala.fase !== 'showdown') proximaFase(sala);
    }
}

function finalizarRodada(sala) {
    sala.status = 'finalizado';
    const ativos = sala.jogadores.filter(j => !j.desistiu);

    let maosAvaliadas = ativos.map(j => {
        const todascartas = [...j.mao, ...sala.cartasComunitarias].map(c => `${c.valor}${c.naipe}`);
        const hand = Hand.solve(todascartas);
        return { jogador: j, hand: hand };
    });

    const vencedores = Hand.winners(maosAvaliadas.map(m => m.hand));
    const ganhadoresObjs = maosAvaliadas.filter(m => vencedores.includes(m.hand));
    
    const premioDividido = Math.floor(sala.pote / ganhadoresObjs.length);

    ganhadoresObjs.forEach(g => {
        g.jogador.fichas += premioDividido;
        g.jogador.resultado = `Venceu (${g.hand.descr})! (+${premioDividido})`;
    });
}

module.exports = {
    iniciarJogo: (sala) => {
        sala.baralho = criarBaralho();
        sala.cartasComunitarias = [];
        sala.pote = 0;
        sala.status = 'jogando';
        sala.fase = 'pre-flop';
        
        if (sala.dealerIndex === undefined) sala.dealerIndex = 0;
        else sala.dealerIndex = (sala.dealerIndex + 1) % sala.jogadores.length;

        const sbIndex = (sala.dealerIndex + 1) % sala.jogadores.length;
        const bbIndex = (sala.dealerIndex + 2) % sala.jogadores.length;

        const valorSB = 10;
        const valorBB = 20;
        sala.apostaMesa = valorBB;

        sala.jogadores.forEach((j, idx) => {
            if (j.fichas === undefined) j.fichas = sala.bancaInicial;
            j.mao = [sala.baralho.pop(), sala.baralho.pop()];
            j.desistiu = false;
            j.allIn = false;
            j.agiuNestaRodada = false;
            j.apostaAtual = 0;
            j.resultado = '';
            
            j.papel = (idx === sala.dealerIndex) ? 'D' : (idx === sbIndex) ? 'SB' : (idx === bbIndex) ? 'BB' : '';
        });

        const cobrar = (idx, valor) => {
            const j = sala.jogadores[idx];
            const desc = Math.min(j.fichas, valor);
            j.fichas -= desc;
            j.apostaAtual = desc;
            sala.pote += desc;
            if (j.fichas === 0) j.allIn = true;
        };
        cobrar(sbIndex, valorSB);
        cobrar(bbIndex, valorBB);

        sala.turnoIndex = (sala.dealerIndex + 3) % sala.jogadores.length;
    },

    processarAcao: (sala, jogadorId, acao, valor = 0) => {
        const j = sala.jogadores[sala.turnoIndex];
        if (!j || j.id !== jogadorId || j.desistiu || j.allIn) return false;

        j.agiuNestaRodada = true;
        const diferencaParaMesa = sala.apostaMesa - j.apostaAtual;

        if (acao === 'fold') {
            j.desistiu = true;
        } 
        else if (acao === 'check') {
            if (diferencaParaMesa > 0) return false; 
        } 
        else if (acao === 'call') {
            const desc = Math.min(j.fichas, diferencaParaMesa);
            j.fichas -= desc;
            j.apostaAtual += desc;
            sala.pote += desc;
            if (j.fichas === 0) j.allIn = true;
        } 
        else if (acao === 'raise') {
            const novaAposta = sala.apostaMesa + parseInt(valor);
            const diferencaTotal = novaAposta - j.apostaAtual;
            
            if (j.fichas < diferencaTotal) return false; 

            j.fichas -= diferencaTotal;
            j.apostaAtual = novaAposta;
            sala.apostaMesa = novaAposta;
            sala.pote += diferencaTotal;
            
            sala.jogadores.forEach(outro => {
                if (outro.id !== j.id && !outro.desistiu && !outro.allIn) outro.agiuNestaRodada = false;
            });
        }
        else if (acao === 'allin') {
            const tudo = j.fichas;
            j.fichas = 0;
            j.apostaAtual += tudo;
            sala.pote += tudo;
            j.allIn = true;

            if (j.apostaAtual > sala.apostaMesa) {
                sala.apostaMesa = j.apostaAtual;
                sala.jogadores.forEach(outro => {
                    if (outro.id !== j.id && !outro.desistiu && !outro.allIn) outro.agiuNestaRodada = false;
                });
            }
        }

        avancarTurno(sala);
        return true;
    }
};