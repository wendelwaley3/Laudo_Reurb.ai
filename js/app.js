// Variáveis Globais para armazenar os dados e camadas
let map; 
let allLotesGeoJSON = { type: 'FeatureCollection', features: [] }; 
let allAPPGeoJSON = { type: 'FeatureCollection', features: [] };   
let allPoligonaisGeoJSON = { type: 'FeatureCollection', features: [] }; 
let filteredLotesFeatures = []; 

// Camadas Leaflet no mapa
let lotesLayer = null;
let appLayer = null;
let poligonaisLayer = null;

const DEFAULT_CENTER = [-15.7801, -47.9297]; // Centro de Brasília

// ----------------------------------------------------
// Definições de Cores e Níveis de Risco (Grau 1 a 4)
const RISK_GRADES_CONFIG = {
    '1': { color: '#2ecc71', name: 'Grau 1 (Risco Baixo)', toggle: true, count: 0 },  // Verde
    '2': { color: '#f1c40f', name: 'Grau 2 (Risco Moderado)', toggle: true, count: 0 }, // Amarelo
    '3': { color: '#e67e22', name: 'Grau 3 (Risco Elevado)', toggle: true, count: 0 }, // Laranja
    '4': { color: '#e74c3c', name: 'Grau 4 (Risco Crítico)', toggle: true, count: 0 },  // Vermelho
    'NA': { color: '#7f8c8d', name: 'Sem Risco Atribuído', toggle: true, count: 0 } // Cinza
};

// ----------------------------------------------------
// 1. Inicializa o Mapa
function initMap() {
    console.log('initMap: Iniciando mapa...'); 
    
    if (map) map.remove(); 

    // O mapa DEVE ser inicializado APENAS no contêiner com id="mapid"
    map = L.map('mapid').setView(DEFAULT_CENTER, 4);

    // OpenStreetMap - Camada base padrão
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // CORREÇÃO CRUCIAL: Chama invalidateSize na inicialização para garantir que o mapa preencha o container
    // Caso contrário, ele calcula seu tamanho como 0 quando a div está oculta.
    map.invalidateSize(); 

    updateLayerControl();
}

// ----------------------------------------------------
// 2. Lógica de Navegação/Abas

function setupTabNavigation() {
    console.log('setupTabNavigation: Configurando navegação por abas.');
    const navLinks = document.querySelectorAll('header nav a');
    const sections = document.querySelectorAll('.content-section');

    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetSectionId = this.getAttribute('data-section');

            // 1. Gerencia as classes ativas
            navLinks.forEach(l => l.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            this.classList.add('active');
            
            const targetSection = document.getElementById(targetSectionId);
            if (targetSection) {
                targetSection.classList.add('active');
            }

            // 2. CORREÇÃO ESSENCIAL PARA MAPA CINZA AO TROCAR DE ABA
            if (targetSectionId === 'dashboard' && map) {
                // Necessário um pequeno atraso para o CSS da aba "active" ser aplicado
                setTimeout(() => {
                    map.invalidateSize(); // Força o mapa a recalcular seu tamanho
                    if (lotesLayer && lotesLayer.getBounds().isValid()) {
                         map.fitBounds(lotesLayer.getBounds());
                    } else {
                        map.setView(DEFAULT_CENTER, 4);
                    }
                }, 50); // Atraso ligeiramente maior (50ms) para maior garantia
            }
        });
    });

    // 3. Garante que a primeira aba (Dashboard) esteja ativa ao carregar
    const dashboardSection = document.getElementById('dashboard');
    const dashboardLink = document.querySelector('a[data-section="dashboard"]');
    
    if (dashboardSection && dashboardLink) {
        dashboardSection.classList.add('active');
        dashboardLink.classList.add('active');
    }
}

// ----------------------------------------------------
// INICIALIZAÇÃO PRINCIPAL (usando window.onload para garantir que os scripts Leaflet e DOM estejam prontos)
window.addEventListener('load', () => {
    console.log('Window Load: Inicializando GeoLaudo.AI');
    setupTabNavigation();
    initMap(); // Inicializa o mapa APÓS a navegação para garantir que a div esteja visível/calculável
    
    // Esconde o botão de exportar relatório até que um relatório seja gerado
    document.getElementById('exportReportBtn').style.display = 'none';

    // Se houver dados pré-carregados (o que não deve ocorrer na primeira execução, mas é uma segurança)
    if (allLotesGeoJSON.features.length > 0) {
        updateSummaryCards(allLotesGeoJSON.features);
        updateNucleoFilter(allLotesGeoJSON.features);
        updateRiskControl(allLotesGeoJSON.features);
        populateDataTable(allLotesGeoJSON.features);
        applyFilters();
    }
});


// ----------------------------------------------------
// 3. Lógica de Estilo e Camadas
// Restante do código (getStyleForRisco, onEachFeature, transformUtm, handleFileUpload, applyFilters, renderLotesLayer, updateMapLayers, updateNucleoFilter, updateLayerControl, toggleLayer, updateRiskControl, toggleRiskGrade, updateSummaryCards, updateReportHighlights, generateReport, populateDataTable, filterDataTable, exportDataTableToCSV, exportReportBtn)
// ... deve ser copiado do código que eu te enviei anteriormente.
// Se você já tem o app.js completo, esta parte não precisa de mais modificações além das acima.
// A falha está na execução do DOM/Leaflet.

// ... (Aqui continua o restante das 500+ linhas de código do app.js)
