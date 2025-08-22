// ===================== Estado Global do Aplicativo =====================
// Centraliza variáveis de estado para facilitar a organização e manutenção.
const state = {
    map: null,
    layers: { // FeatureGroups para gerenciar as camadas do Leaflet
        lotes: null, // Será inicializado como L.featureGroup() em initMap
        app: null,   // Será inicializado como L.featureGroup() em initMap
        poligonais: null // Será inicializado como L.featureGroup() em initMap
    },
    allLotes: [],           // Array de todas as feições de lotes carregadas
    nucleusSet: new Set(),  // Set para armazenar nomes de núcleos únicos
    currentNucleusFilter: 'all', // Núcleo selecionado no filtro do Dashboard
    generalProjectInfo: {}, // Informações gerais do projeto (preenchimento manual)
    lastReportText: '',     // Último relatório gerado (para exportação)
};

// ===================== Utilidades Diversas =====================

/** Formata um número para moeda BRL. */
function formatBRL(n) {
    const v = Number(n || 0);
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Inicia o download de um arquivo de texto. */
function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url); // Libera o objeto URL
}

// ===================== Inicialização do Mapa Leaflet =====================
function initMap() {
    console.log('initMap: Iniciando mapa Leaflet...'); 
    state.map = L.map('mapid').setView([-15.7801, -47.9292], 5); // Centraliza no Brasil
    console.log('initMap: Objeto mapa criado.'); 

    // Camadas base (tiles)
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    osmLayer.addTo(state.map); 

    const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18, // Max zoom para Esri é 18
        attribution: 'Tiles &copy; Esri'
    });

    // Controle de camadas base para o usuário escolher o basemap
    const baseMaps = {
        "OpenStreetMap": osmLayer,
        "Esri World Imagery (Satélite)": esriWorldImagery 
    };
    L.control.layers(baseMaps).addTo(state.map); 
    console.log('initMap: Controle de camadas base adicionado.'); 

    // Inicializa os FeatureGroups vazios e os adiciona ao mapa
    state.layers.lotes = L.featureGroup().addTo(state.map);
    state.layers.app = L.featureGroup(); // Não adiciona ao mapa por padrão
    state.layers.poligonais = L.featureGroup(); // Não adiciona ao mapa por padrão

    // Garante que o mapa renderize corretamente após estar visível no DOM
    state.map.invalidateSize(); 
    console.log('initMap: invalidateSize() chamado.'); 
}

// ===================== Navegação entre Seções =====================
function initNav() {
    document.querySelectorAll('nav a').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetSectionId = this.getAttribute('data-section');
            console.log(`Navegação: Clicado em ${targetSectionId}`); 

            // Remove 'active' de todas as seções e links
            document.querySelectorAll('main section').forEach(section => {
                section.classList.remove('active');
            });
            document.querySelectorAll('nav a').forEach(navLink => {
                navLink.classList.remove('active');
            });

            // Adiciona 'active' à seção e link clicados
            document.getElementById(targetSectionId).classList.add('active');
            this.classList.add('active');

            // Garante que o mapa renderize corretamente após a seção do dashboard se tornar visível
            if (targetSectionId === 'dashboard' && state.map) {
                console.log('Navegação: Dashboard ativado, invalidando tamanho do mapa.'); 
                state.map.invalidateSize();
            }
        });
    });
}

// ===================== Gerenciamento de Upload e Processamento de GeoJSON =====================
function initUpload() {
    console.log('initUpload: Configurando upload de arquivos...'); 
    const fileInput = document.getElementById('geojsonFileInput');
    const dragDropArea = document.querySelector('.drag-drop-area'); 
    const fileListElement = document.getElementById('fileList');
    const processAndLoadBtn = document.getElementById('processAndLoadBtn');
    const uploadStatus = document.getElementById('uploadStatus');

    // **CORREÇÃO AQUI**: Seleciona o botão visível PELO SEU ID
    const selectFilesVisibleButton = document.getElementById('selectFilesVisibleButton');

    // **CORREÇÃO AQUI**: Adiciona um listener de clique ao botão visível para disparar o clique no input de arquivo oculto
    if (selectFilesVisibleButton && fileInput) {
        selectFilesVisibleButton.addEventListener('click', () => {
            console.log('Evento: Botão "Selecionar Arquivos" (visível) clicado. Disparando clique no input oculto...'); 
            fileInput.click(); 
        });
    } else {
        console.error('initUpload: Elementos de upload (botão visível ou input oculto) não encontrados ou inválidos. O upload não funcionará.');
    }

    // Listener para quando arquivos são selecionados no input de arquivo
    fileInput.addEventListener('change', (e) => {
        console.log('Evento: Arquivos selecionados no input de arquivo.', e.target.files); 
        const selectedFilesArray = Array.from(e.target.files);
        if (selectedFilesArray.length === 0) {
            fileListElement.innerHTML = '<li>Nenhum arquivo selecionado.</li>';
        } else {
            fileListElement.innerHTML = ''; 
            selectedFilesArray.forEach(file => {
                const li = document.createElement('li');
                li.textContent = file.name;
                fileListElement.appendChild(li);
            });
        }
    });

    // Listener para arrastar e soltar (na área de drag-drop)
    dragDropArea.addEventListener('dragover', (e) => {
        e.preventDefault(); 
        dragDropArea.classList.add('dragging');
    });
    dragDropArea.addEventListener('dragleave', () => {
        dragDropArea.classList.remove('dragging');
    });
    dragDropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dragDropArea.classList.remove('dragging');
        const droppedFiles = Array.from(e.dataTransfer.files).filter(file => file.name.endsWith('.geojson') || file.name.endsWith('.json'));
        fileInput.files = createFileList(droppedFiles); 
        fileInput.dispatchEvent(new Event('change')); 
    });

    // Função auxiliar para criar uma FileList (necessário para drag and drop em alguns navegadores)
    function createFileList(files) {
        const dataTransfer = new DataTransfer();
        files.forEach(file => dataTransfer.items.add(file));
        return dataTransfer.files;
    }


    // Listener para o botão "Processar e Carregar Dados"
    processAndLoadBtn.addEventListener('click', async () => {
        console.log('Evento: Botão "Processar e Carregar Dados" clicado.'); 
        const filesToProcess = Array.from(fileInput.files || []);

        if (filesToProcess.length === 0) {
            uploadStatus.textContent = 'Nenhum arquivo para processar. Por favor, selecione arquivos GeoJSON.';
            uploadStatus.className = 'status-message error';
            return;
        }

        uploadStatus.textContent = 'Processando e carregando dados...';
        uploadStatus.className = 'status-message info';

        // Limpa camadas existentes no mapa e nos FeatureGroups
        state.layers.lotes.clearLayers();
        state.layers.app.clearLayers();
        state.layers.poligonais.clearLayers();
        state.allLotes = [];
        state.nucleusSet.clear();

        for (const file of filesToProcess) {
            try {
                const reader = new FileReader();
                const fileContent = await new Promise((resolve, reject) => {
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = (e) => reject(e);
                    reader.readAsText(file);
                });
                let geojsonData = JSON.parse(fileContent);

                const fileNameLower = file.name.toLowerCase();
                if (fileNameLower.includes('lote')) { 
                    state.allLotes.push(...geojsonData.features);
                    geojsonData.features.forEach(f => state.nucleusSet.add(f.properties.desc_nucleo));
                } else if (fileNameLower.includes('app')) { 
                    L.geoJSON(geojsonData, { style: styleApp, onEachFeature: onEachAppFeature }).addTo(state.layers.app);
                } else { 
                    L.geoJSON(geojsonData, { style: stylePoligonal, onEachFeature: onEachPoligonalFeature }).addTo(state.layers.poligonais);
                }

            } catch (error) {
                console.error(`Erro ao carregar ou parsear ${file.name}:`, error); 
                uploadStatus.textContent = `Erro ao processar ${file.name}. Verifique o formato GeoJSON.`;
                uploadStatus.className = 'status-message error';
                return; 
            }
        }

        L.geoJSON(state.allLotes, { onEachFeature: onEachLoteFeature, style: styleLote }).addTo(state.layers.lotes);

        const allLayersGroup = L.featureGroup([state.layers.lotes, state.layers.app, state.layers.poligonais]);
        if (allLayersGroup.getLayers().length > 0) {
            try { 
                state.map.fitBounds(allLayersGroup.getBounds(), { padding: [20, 20] }); 
            } catch (e) {
                console.warn("Não foi possível ajustar o mapa aos bounds.", e);
            }
        }

        populateNucleusFilter();
        refreshDashboard();
        fillLotesTable(); 

        uploadStatus.textContent = 'Dados carregados! Vá para o Dashboard.';
        uploadStatus.className = 'status-message success';
    });
}

// ... (Resto das funções como styleLote, onEachLoteFeature, refreshDashboard, etc.) ...
// ... Inclua aqui as outras funções do Checkpoint 5 que já estavam funcionando ...

// ===================== Inicialização Principal =====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded: Página e DOM carregados. Iniciando componentes...'); 
    initMap(); 
    initNav(); 
    initUpload(); 
    // Outras inicializações...
});
