const naipes = ['♠', '♥', '♦', '♣'];
const valores = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function criarBaralho() {
    let baralho = [];
    for (let n of naipes) for (let v of valores) baralho.push({ valor: v, naipe: n });
    return baralho.sort(() => Math.random() - 0.5);
}

function calcularPontos(cartas) {
    let pontos = 0, numAses = 0;
    for (let c of cartas) {
        if (c.valor === 'A') { pontos += 11; numAses++; }
        else if (['J', 'Q', 'K'].includes(c.valor)) pontos += 10;
        else pontos += parseInt(c.valor);
    }
    while (pontos > 21 && numAses > 0) { pontos -= 10; numAses--; }
    return pontos;
}

function avaliarPerfectPairs(c1, c2) {
    if (c1.valor !== c2.valor) return 0;
    if (c1.naipe === c2.naipe) return 25; 
    const vermelhos = ['♥', '♦'];
    const eVermelho1 = vermelhos.includes(c1.naipe);
    const eVermelho2 = vermelhos.includes(c2.naipe);
    if (eVermelho1 === eVermelho2) return 12; 
    return 6; 
}

function avaliar21Plus3(c1, c2, dealerCard) {
    const cartas = [c1, c2, dealerCard];
    const mapaValores = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14};
    const ranks = cartas.map(c => mapaValores[c.valor]).sort((a,b) => a - b);
    const naipesArr = cartas.map(c => c.naipe);

    const mesmonaipe = naipesArr[0] === naipesArr[1] && naipesArr[1] === naipesArr[2];
    let eSequencia = (ranks[0] + 1 === ranks[1] && ranks[1] + 1 === ranks[2]);
    if (!eSequencia && ranks[2] === 14) { 
        const ranksAs1 = cartas.map(c => c.valor === 'A' ? 1 : mapaValores[c.valor]).sort((a,b) => a - b);
        if (ranksAs1[0] + 1 === ranksAs1[1] && ranksAs1[1] + 1 === ranksAs1[2]) eSequencia = true;
    }
    const trinca = cartas[0].valor === cartas[1].valor && cartas[1].valor === cartas[2].valor;

    if (trinca && mesmonaipe) return 100;
    if (eSequencia && mesmonaipe) return 40;
    if (trinca) return 30;
    if (eSequencia) return 10;
    if (mesmonaipe) return 5;
    return 0;
}

function proximoTurno(sala) {
    let jogadorAtual = sala.jogadores[sala.turnoIndex];
    let maoAtiva = jogadorAtual.maos.find(m => !m.finalizada);

    if (!maoAtiva) {
        sala.turnoIndex++;
        if (sala.turnoIndex >= sala.jogadores.length) {
            jogarBanca(sala);
            return;
        }
    }
}

function jogarBanca(sala) {
    let pontosBanca = calcularPontos(sala.maoBanca);
    while (pontosBanca < 17) {
        sala.maoBanca.push(sala.baralho.pop());
        pontosBanca = calcularPontos(sala.maoBanca);
    }
    sala.status = 'finalizado';

    sala.jogadores.forEach(j => {
        j.maos.forEach(m => {
            const p = calcularPontos(m.cartas);
            let ganhoMultiplier = 0;

            if (p > 21) {
                m.resultado = 'Estourou!';
            } else if (pontosBanca > 21 || p > pontosBanca) {
                m.resultado = 'Venceu!';
                ganhoMultiplier = 2; 
            } else if (p < pontosBanca) {
                m.resultado = 'Perdeu';
            } else {
                m.resultado = 'Empate';
                ganhoMultiplier = 1; 
            }

            if (ganhoMultiplier > 0) {
                j.fichas += m.aposta * ganhoMultiplier;
            }

            sala.jogadores.forEach(apostador => {
                if (apostador.betBehindTarget === j.id && ganhoMultiplier > 0) {
                    apostador.fichas += apostador.betBehindAposta * ganhoMultiplier;
                }
            });
        });
    });
}

module.exports = {
    iniciarFaseApostas: (sala) => {
        sala.status = 'apostas';
        sala.baralho = criarBaralho();
        sala.maoBanca = [];
        sala.turnoIndex = 0;
        sala.jogadores.forEach(j => {
            j.maos = [];
            j.apostaPrincipal = 0;
            j.sidePerfectPairs = 0;
            j.side21Plus3 = 0;
            j.betBehindTarget = null;
            j.betBehindAposta = 0;
            j.mensagensSide = '';
        });
    },

    comecarRodada: (sala) => {
        sala.status = 'jogando';
        sala.maoBanca = [sala.baralho.pop(), sala.baralho.pop()];

        sala.jogadores.forEach(j => {
            if (j.apostaPrincipal > 0) {
                j.maos = [{
                    cartas: [sala.baralho.pop(), sala.baralho.pop()],
                    aposta: j.apostaPrincipal,
                    finalizada: false,
                    resultado: ''
                }];

                const c1 = j.maos[0].cartas[0];
                const c2 = j.maos[0].cartas[1];

                if (j.sidePerfectPairs > 0) {
                    const multPP = avaliarPerfectPairs(c1, c2);
                    if (multPP > 0) {
                        const premio = j.sidePerfectPairs * (multPP + 1);
                        j.fichas += premio;
                        j.mensagensSide += ` Perfect Pairs (+${premio})!`;
                    }
                }

                if (j.side21Plus3 > 0) {
                    const mult21 = avaliar21Plus3(c1, c2, sala.maoBanca[0]);
                    if (mult21 > 0) {
                        const premio = j.side21Plus3 * (mult21 + 1);
                        j.fichas += premio;
                        j.mensagensSide += ` 21+3 (+${premio})!`;
                    }
                }
            } else {
                j.maos = [];
            }
        });
    },

    pedirCarta: (sala, jogadorId) => {
        const j = sala.jogadores[sala.turnoIndex];
        if (!j || j.id !== jogadorId) return false;
        const mao = j.maos.find(m => !m.finalizada);
        if (!mao) return false;

        mao.cartas.push(sala.baralho.pop());
        if (calcularPontos(mao.cartas) >= 21) {
            mao.finalizada = true;
            proximoTurno(sala);
        }
        return true;
    },

    parar: (sala, jogadorId) => {
        const j = sala.jogadores[sala.turnoIndex];
        if (!j || j.id !== jogadorId) return false;
        const mao = j.maos.find(m => !m.finalizada);
        if (!mao) return false;

        mao.finalizada = true;
        proximoTurno(sala);
        return true;
    },

    dobrar: (sala, jogadorId) => {
        const j = sala.jogadores[sala.turnoIndex];
        if (!j || j.id !== jogadorId) return false;
        const mao = j.maos.find(m => !m.finalizada);
        if (!mao || mao.cartas.length !== 2 || j.fichas < mao.aposta) return false;

        j.fichas -= mao.aposta;
        mao.aposta *= 2;
        mao.cartas.push(sala.baralho.pop());
        mao.finalizada = true;
        proximoTurno(sala);
        return true;
    },

    dividir: (sala, jogadorId) => {
        const j = sala.jogadores[sala.turnoIndex];
        if (!j || j.id !== jogadorId) return false;
        const mao = j.maos.find(m => !m.finalizada);
        if (!mao || mao.cartas.length !== 2) return false;

        const val1 = ['J','Q','K'].includes(mao.cartas[0].valor) ? '10' : mao.cartas[0].valor;
        const val2 = ['J','Q','K'].includes(mao.cartas[1].valor) ? '10' : mao.cartas[1].valor;
        if (val1 !== val2 || j.fichas < mao.aposta) return false;

        j.fichas -= mao.aposta;
        const segundaCarta = mao.cartas.pop();

        j.maos.push({
            cartas: [segundaCarta, sala.baralho.pop()],
            aposta: mao.aposta,
            finalizada: false,
            resultado: ''
        });

        mao.cartas.push(sala.baralho.pop());
        return true;
    }
};