// ===================== Estado Global do Aplicativo =====================
const state = {
    map: null,
    layers: {
        lotes: null,
        app: null,
        poligonais: null
    },
    allLotes: [],
    nucleusSet: new Set(),
    currentNucleusFilter: 'all',
    generalProjectInfo: {},
    lastReportText: '',
};

// ... (Resto das funções de utilidade, inicialização, etc. - como no Checkpoint 5) ...

// ===================== Dashboard =====================
function refreshDashboard() {
    console.log('refreshDashboard: Atualizando cards do dashboard.');
    const feats = filteredLotes();
    const totalLotesCount = feats.length;

    let lotesRiscoAltoMuitoAlto = 0;
    let lotesAppCount = 0;
    let custoTotal = 0;
    let custoMin = Infinity;
    let custoMax = -Infinity;
    let riskCounts = { 'Baixo': 0, 'Médio': 0, 'Alto': 0, 'Muito Alto': 0 };

    feats.forEach(f => {
        const p = f.properties || {};
        // **CORREÇÃO AQUI**: Lógica de contagem de risco mais robusta
        const risco = String(p.risco || p.status_risco || p.grau || 'N/A').toLowerCase();

        if (risco === '1' || risco.includes('baixo')) riskCounts['Baixo']++;
        else if (risco === '2' || risco.includes('médio') || risco.includes('medio')) riskCounts['Médio']++;
        else if (risco === '3' || risco.includes('alto') && !risco.includes('muito')) riskCounts['Alto']++;
        else if (risco === '4' || risco.includes('muito alto')) riskCounts['Muito Alto']++;
        
        if (risco === '3' || risco === '4' || risco.includes('alto')) {
            lotesRiscoAltoMuitoAlto++;
        }
        
        const dentroApp = Number(p.dentro_app || p.app || 0);
        if (dentroApp > 0) lotesAppCount++;

        const valorCusto = Number(p.valor || p.custo_intervencao || 0);
        if (!isNaN(valorCusto) && valorCusto > 0) {
            custoTotal += valorCusto;
            if (valorCusto < custoMin) custoMin = valorCusto;
            if (valorCusto > custoMax) custoMax = valorCusto;
        }
    });

    document.getElementById('totalLotes').textContent = totalLotesCount;
    document.getElementById('lotesRisco').textContent = lotesRiscoAltoMuitoAlto;
    document.getElementById('lotesApp').textContent = lotesAppCount;
    document.getElementById('custoEstimado').textContent = formatBRL(custoTotal).replace('R$', '').trim();

    document.getElementById('riskLowCount').textContent = riskCounts['Baixo'];
    document.getElementById('riskMediumCount').textContent = riskCounts['Médio'];
    document.getElementById('riskHighCount').textContent = riskCounts['Alto'];
    document.getElementById('riskVeryHighCount').textContent = riskCounts['Muito Alto'];

    document.getElementById('areasIdentificadas').textContent = lotesRiscoAltoMuitoAlto;
    document.getElementById('areasIntervencao').textContent = lotesRiscoAltoMuitoAlto;
    document.getElementById('minCustoIntervencao').textContent = `Custo Mínimo de Intervenção: ${custoMin === Infinity ? 'N/D' : formatBRL(custoMin)}`;
    document.getElementById('maxCustoIntervencao').textContent = `Custo Máximo de Intervenção: ${custoMax === -Infinity ? 'N/D' : formatBRL(custoMax)}`;
}

// ===================== Tabela de Lotes =====================
function fillLotesTable() {
    console.log('fillLotesTable: Preenchendo tabela de lotes.');
    const tbody = document.querySelector('#lotesDataTable tbody');
    const feats = filteredLotes();
    tbody.innerHTML = '';

    if (feats.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">Nenhum dado disponível.</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();
    feats.forEach(f => {
        const p = f.properties || {};
        const tr = document.createElement('tr');
        const codLote = p.cod_lote || 'N/A';
        tr.innerHTML = `
            <td>${codLote}</td>
            <td>${p.desc_nucleo || 'N/A'}</td>
            <td>${p.tipo_uso || 'N/A'}</td>
            <td>${p.area_m2 ? p.area_m2.toLocaleString('pt-BR') : 'N/A'}</td>
            <td>${p.risco || p.status_risco || p.grau || 'N/A'}</td>
            <td>${(Number(p.dentro_app) > 0) ? 'Sim' : 'Não'}</td>
            <td><button class="zoomLoteBtn small-btn" data-codlote="${codLote}">Ver no Mapa</button></td>
        `;
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);

    // **CORREÇÃO AQUI**: Adiciona listeners para os botões "Ver no Mapa"
    tbody.querySelectorAll('.zoomLoteBtn').forEach(btn => {
        btn.addEventListener('click', () => {
            const codLoteToZoom = btn.getAttribute('data-codlote');
            const loteToZoom = state.allLotes.find(l => (l.properties?.cod_lote == codLoteToZoom));
            if (loteToZoom) {
                document.querySelector('nav a[data-section="dashboard"]').click();
                const tempLayer = L.geoJSON(loteToZoom);
                try { 
                    state.map.fitBounds(tempLayer.getBounds(), { padding: [50, 50] }); 
                } catch (e) {
                    console.warn("Erro ao dar zoom no lote:", e);
                }
                state.layers.lotes.eachLayer(l => {
                    if (l.feature?.properties?.cod_lote == codLoteToZoom && l.openPopup) {
                        l.openPopup();
                    }
                });
            } else {
                console.warn(`Lote com código ${codLoteToZoom} não encontrado para zoom.`);
            }
        });
    });
}
