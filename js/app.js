// ===================== Estado Global do Aplicativo =====================
const state = {
    map: null,
    layers: { 
        lotes: null, 
        app: null,   
        poligonais: null,
        areasRisco: null // NOVO: FeatureGroup para áreas de risco
    },
    allLotes: [],           
    allAPPGeoJSON: { type: 'FeatureCollection', features: [] }, 
    allPoligonaisGeoJSON: { type: 'FeatureCollection', features: [] }, 
    allAreasRiscoGeoJSON: { type: 'FeatureCollection', features: [] }, // NOVO: Armazena áreas de risco
    nucleusSet: new Set(),  
    currentNucleusFilter: 'all', 
    utmOptions: { useUtm: false, zone: 23, south: true }, 
    generalProjectInfo: {}, 
    lastReportText: '',     
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

/** Calcula a área de uma feature usando Turf.js. */
function featureAreaM2(feature) {
    try {
        // Turf.area retorna em metros quadrados se a projeção for WGS84
        return turf.area(feature);
    } catch (e) {
        console.warn('Erro ao calcular área com Turf.js:', e);
        return 0;
    }
}

/** Garante que um anel de polígono seja fechado (primeiro e último ponto iguais). */
function ensurePolygonClosed(coords) {
    if (!coords || coords.length === 0) return coords;
    const first = coords[0];
    const last = coords[coords.length - 1];
    // Se o primeiro e o último ponto não são iguais, adiciona o primeiro no final
    if (first[0] !== last[0] || first[1] !== last[1]) {
        coords.push(first);
    }
    return coords;
}

// ===================== Reprojeção UTM → WGS84 (client-side com proj4js) =====================
/** Converte um ponto UTM (x,y) para Lat/Lng (WGS84). */
function utmToLngLat(x, y, zone, south) {
    const def = `+proj=utm +zone=${Number(zone)} ${south ? '+south ' : ''}+datum=WGS84 +units=m +no_defs`;
    const p = proj4(def, proj4.WGS84, [x, y]);
    return [p[0], p[1]]; 
}

/** Converte um GeoJSON inteiro de UTM para WGS84. */
function reprojectGeoJSONFromUTM(geojson, zone, south) {
    const converted = JSON.parse(JSON.stringify(geojson)); 

    function convertGeometryCoords(coords, geomType) {
        if (!coords || coords.length === 0) return coords;
        if (geomType === 'Point') return utmToLngLat(coords[0], coords[1], zone, south);
        if (geomType === 'LineString' || geomType === 'MultiPoint') return coords.map(coord => utmToLngLat(coord[0], coord[1], zone, south));
        if (geomType === 'Polygon') return coords.map(ring => ensurePolygonClosed(ring.map(coord => utmToLngLat(coord[0], coord[1], zone, south))));
        if (geomType === 'MultiLineString') return coords.map(line => line.map(coord => utmToLngLat(coord[0], coord[1], zone, south)));
        if (geomType === 'MultiPolygon') return coords.map(polygon => polygon.map(ring => ensurePolygonClosed(ring.map(coord => utmToLngLat(coord[0], coord[1], zone, south)))));
        return coords;
    }

    if (converted.type === 'FeatureCollection') {
        converted.features = converted.features.map(feature => {
            if (feature.geometry) feature.geometry.coordinates = convertGeometryCoords(feature.geometry.coordinates, feature.geometry.type);
            return feature;
        });
    } else if (converted.type === 'Feature') {
        if (converted.geometry) converted.geometry.coordinates = convertGeometryCoords(converted.geometry.coordinates, converted.geometry.type);
    } else {
        converted.coordinates = convertGeometryCoords(converted.coordinates, converted.type);
    }
    return converted;
}

// ===================== Simulações de IBGE e IA (para ambiente client-side) =====================
const ibgeDataSimulado = {
    "Conselheiro Lafaiete": {
        municipio: "Conselheiro Lafaiete",
        regiao: "Sudeste",
        populacao: "131.200 (estimativa 2023)",
        area_km2: "367.359"
    },
    // Adicione mais dados simulados
};

function getSimulatedMunicipioData(nomeMunicipio) {
    const data = ibgeDataSimulado[nomeMunicipio];
    if (data) return data;
    return {
        municipio: nomeMunicipio, regiao: "Não informado", populacao: "N/D (Dados simulados)", area_km2: "N/D (Dados simulados)"
    };
}

function generateSimulatedAILaudo(promptData) {
    let laudo = `\n[RELATÓRIO GERADO POR IA - SIMULADO]\n\n`;
    laudo += `**Tema Principal:** ${promptData.tema}\n`;
    laudo += `**Detalhes da Análise:** ${promptData.detalhes}\n\n`;
    if (promptData.dados_ibge && promptData.dados_ibge.municipio) {
        laudo += `--- Dados IBGE para ${promptData.dados_ibge.municipio} ---\n`;
        laudo += `Região: ${promptData.dados_ibge.regiao}\n`;
        laudo += `População Estimada: ${promptData.dados_ibge.populacao}\n`;
        laudo += `Área Territorial: ${promptData.dados_ibge.area_km2} km²\n\n`;
    }
    laudo += `**Análise Contextual:**\nBaseado nos dados fornecidos e em conhecimentos gerais de REURB, a área apresenta características urbanísticas e fundiárias que demandam avaliação conforme a legislação. A infraestrutura básica e a regularidade documental são pontos cruciais para a consolidação da regularização.\n\n`;
    laudo += `**Recomendações:**\n1. Verificação documental aprofundada dos títulos e matrículas.\n2. Levantamento topográfico e cadastral detalhado para delimitação precisa dos lotes.\n3. Análise ambiental para identificar e mitigar impactos, especialmente em áreas de preservação.\n4. Planejamento de obras de infraestrutura quando necessário.\n\n`;
    laudo += `Este laudo é uma simulação e deve ser complementado por uma análise técnica e jurídica completa realizada por profissionais habilitados.\n\n`;
    return laudo;
}


// ===================== Inicialização do Mapa Leaflet =====================
function initMap() {
    console.log('initMap: Iniciando mapa Leaflet...'); 
    state.map = L.map('mapid').setView([-15.7801, -47.9292], 5); // Centraliza no Brasil
    console.log('initMap: Objeto mapa criado.'); 

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    osmLayer.addTo(state.map); 

    const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18, 
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    const baseMaps = {"OpenStreetMap": osmLayer, "Esri World Imagery (Satélite)": esriWorldImagery};
    L.control.layers(baseMaps).addTo(state.map); 
    console.log('initMap: Controle de camadas base adicionado.'); 

    state.layers.lotes = L.featureGroup().addTo(state.map);
    state.layers.app = L.featureGroup().addTo(state.map); 
    state.layers.poligonais = L.featureGroup().addTo(state.map); 
    state.layers.areasRisco = L.featureGroup().addTo(state.map); // NOVO: Adiciona a camada de áreas de risco

    state.map.removeLayer(state.layers.app);
    state.map.removeLayer(state.layers.poligonais);
    state.map.removeLayer(state.layers.areasRisco); // NOVO: Remove áreas de risco por padrão

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

            document.querySelectorAll('main section').forEach(section => section.classList.remove('active'));
            document.querySelectorAll('nav a').forEach(navLink => navLink.classList.remove('active'));

            document.getElementById(targetSectionId).classList.add('active');
            this.classList.add('active');

            if (targetSectionId === 'dashboard' && state.map) {
                console.log('Navegação: Dashboard ativado, invalidando tamanho do mapa.'); 
                state.map.invalidateSize();
            }
            if (targetSectionId === 'dados-lotes') { // Preenche a tabela ao ativar a aba
                fillLotesTable();
            }
        });
    });
}
// ===================== Filtros por Núcleo =====================

function filteredLotes() {
    if (state.currentNucleusFilter === 'all') return state.allLotes;
    return state.allLotes.filter(f => f.properties?.desc_nucleo === state.currentNucleusFilter);
}

/** Aplica zoom ao mapa para a extensão dos lotes filtrados. */
function zoomToFilter() {
    console.log(`zoomToFilter: Aplicando zoom para o núcleo: ${state.currentNucleusFilter}`);
    const feats = filteredLotes();

    if (feats.length === 0) {
        console.warn('zoomToFilter: Nenhum lote para o filtro, centralizando no Brasil.');
        state.map.setView([-15.7801, -47.9292], 5); // Centraliza no Brasil se não houver lotes
        return;
    }

    // Cria um FeatureGroup temporário APENAS com os lotes filtrados
    const filteredLotesGroup = L.featureGroup();
    L.geoJSON({ type: 'FeatureCollection', features: feats }, {
        style: styleLote, // Usa o estilo de lotes para renderização temporária
        onEachFeature: onEachLoteFeature // Mantém os popups se houver necessidade
    }).addTo(filteredLotesGroup);

    if (filteredLotesGroup.getLayers().length > 0) {
        try {
            const bounds = filteredLotesGroup.getBounds();
            if (bounds.isValid()) {
                state.map.fitBounds(bounds, { padding: [50, 50] }); // Ajusta o zoom com padding
                console.log('zoomToFilter: Mapa ajustado para os bounds do núcleo filtrado:', bounds);
            } else {
                console.warn("zoomToFilter: Bounds do núcleo filtrado inválidos. Verifique as coordenadas dos lotes neste núcleo.");
                state.map.setView([-15.7801, -47.9292], 10); // Zoom mais próximo como fallback
            }
        } catch (e) {
            console.error("zoomToFilter: Erro ao ajustar o mapa aos bounds do filtro.", e);
            state.map.setView([-15.7801, -47.9292], 10); // Zoom mais próximo como fallback
        }
    } else {
        console.warn('zoomToFilter: Nenhuma camada válida no grupo filtrado para ajuste de zoom.');
        state.map.setView([-15.7801, -47.9292], 5); // Centraliza no Brasil se não houver dados válidos
    }
}

// ===================== Estilos e Popups para Áreas de Risco (Nova Camada) =====================
function styleAreaRisco(feature) {
    // Busca por 'grau', 'risco' ou 'status_risco' e converte para minúsculas
    // Assume que a área de risco também tem uma propriedade que indica seu nível de risco.
    const risco = String(feature.properties.risco || feature.properties.status_risco || feature.properties.grau || 'N/A').toLowerCase();
    let color;
    let borderColor = 'black'; // Borda padrão
    let dashArray = '5,5'; // Linha tracejada padrão

    switch (risco) {
        case '1':
        case 'baixo':
            color = '#8BC34A'; // Verde claro para preenchimento
            borderColor = '#558B2F'; // Verde escuro para borda
            break;
        case '2':
        case 'médio':
        case 'medio':
            color = '#FFC107'; // Amarelo para preenchimento
            borderColor = '#FFA000'; // Laranja para borda
            break;
        case '3':
        case 'alto':
        case 'geologico':
        case 'hidrologico':
            color = '#FF5722'; // Laranja avermelhado para preenchimento
            borderColor = '#D84315'; // Vermelho para borda
            dashArray = '10,5'; // Linha mais destacada
            break;
        case '4':
        case 'muito alto':
            color = '#D32F2F'; // Vermelho escuro para preenchimento
            borderColor = '#B71C1C'; // Vermelho intenso para borda
            dashArray = '1, 5'; // Linha pontilhada (alerta)
            break;
        default:
            color = '#90A4AE'; // Cinza padrão para preenchimento
            borderColor = '#546E7A'; // Cinza escuro para borda
            break;
    }

    return {
        fillColor: color,
        weight: 2, // Borda um pouco mais grossa
        opacity: 0.8,
        color: borderColor, 
        dashArray: dashArray, 
        fillOpacity: 0.4 // Transparência para ver o mapa base por baixo
    };
}

function onEachAreaRiscoFeature(feature, layer) {
    if (feature.properties) {
        let popupContent = "<h3>Detalhes da Área de Risco:</h3>";
        for (let key in feature.properties) {
            let value = feature.properties[key];
            if (value === null || value === undefined || value === '') value = 'N/A';
            popupContent += `<strong>${key}:</strong> ${value}<br>`;
        }
        layer.bindPopup(popupContent);
    }
}
// ===================== Gerenciamento de Upload e Processamento de GeoJSON =====================
function initUpload() {
    console.log('initUpload: Configurando upload de arquivos...'); 
    const fileInput = document.getElementById('geojsonFileInput');
    const dragDropArea = document.querySelector('.drag-drop-area');
    const fileListElement = document.getElementById('fileList');
    const processAndLoadBtn = document.getElementById('processAndLoadBtn');
    const uploadStatus = document.getElementById('uploadStatus');
    const selectFilesVisibleButton = document.getElementById('selectFilesVisibleButton'); 

    const useUtmCheckbox = document.getElementById('useUtmCheckbox');
    const utmOptionsContainer = document.getElementById('utmOptionsContainer');
    const utmZoneInput = document.getElementById('utmZoneInput');
    const utmHemisphereSelect = document.getElementById('utmHemisphereSelect');

    if (!fileInput) console.error('initUpload ERRO: #geojsonFileInput não encontrado!');
    if (!selectFilesVisibleButton) console.error('initUpload ERRO: #selectFilesVisibleButton não encontrado!');

    // Listener para o checkbox UTM
    if (useUtmCheckbox) {
        useUtmCheckbox.addEventListener('change', () => {
            state.utmOptions.useUtm = useUtmCheckbox.checked;
            if (utmOptionsContainer) utmOptionsContainer.style.display = useUtmCheckbox.checked ? 'flex' : 'none';
            console.log(`UTM reprojection toggled: ${state.utmOptions.useUtm}`);
        });
    }
    // Listeners para os campos de configuração UTM
    if (utmZoneInput) utmZoneInput.addEventListener('input', () => { state.utmOptions.zone = Number(utmZoneInput.value) || 23; console.log(`UTM Zone set to: ${state.utmOptions.zone}`); });
    if (utmHemisphereSelect) utmHemisphereSelect.addEventListener('change', () => { state.utmOptions.south = (utmHemisphereSelect.value === 'S'); console.log(`UTM Hemisphere set to: ${state.utmOptions.south ? 'South' : 'Norte'}`); });

    // GARANTE QUE O BOTÃO VISÍVEL ATIVE O INPUT OCULTO
    if (selectFilesVisibleButton && fileInput) {
        selectFilesVisibleButton.addEventListener('click', () => {
            console.log('Evento: Botão "Selecionar Arquivos" (visível) clicado. Disparando clique no input oculto...'); 
            fileInput.click();
        });
    }

    // ATUALIZA A LISTA DE ARQUIVOS EXIBIDA QUANDO ARQUIVOS SÃO SELECIONADOS OU DROPPADOS
    fileInput.addEventListener('change', (e) => {
        console.log('Evento: Arquivos selecionados no input de arquivo.', e.target.files); 
        const selectedFilesArray = Array.from(e.target.files);
        if (selectedFilesArray.length === 0) {
            fileListElement.innerHTML = '<li>Nenhum arquivo selecionado.</li>';
        } else {
            fileListElement.innerHTML = '';
            selectedFilesArray.forEach(file => {
                const li = document.createElement('li'); li.textContent = file.name; fileListElement.appendChild(li);
            });
        }
    });

    // Lógica para ARRASTAR E SOLTAR arquivos
    dragDropArea.addEventListener('dragover', (e) => { e.preventDefault(); dragDropArea.classList.add('dragging'); });
    dragDropArea.addEventListener('dragleave', () => { dragDropArea.classList.remove('dragging'); });
    dragDropArea.addEventListener('drop', (e) => {
        e.preventDefault(); dragDropArea.classList.remove('dragging');
        const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.geojson') || f.name.endsWith('.json'));
        // Cria uma nova FileList para atribuir ao input
        const dataTransfer = new DataTransfer();
        droppedFiles.forEach(file => dataTransfer.items.add(file));
        fileInput.files = dataTransfer.files;
        fileInput.dispatchEvent(new Event('change')); // Dispara o evento change para atualizar a lista exibida
    });

    // =========================================================
    // LISTENER PRINCIPAL DO BOTÃO "PROCESSAR E CARREGAR DADOS"
    // =========================================================
    processAndLoadBtn.addEventListener('click', async () => {
        console.log('Evento: Botão "Processar e Carregar Dados" clicado.'); 
        const filesToProcess = Array.from(fileInput.files || []);

        if (filesToProcess.length === 0) { uploadStatus.textContent = 'Nenhum arquivo para processar.'; uploadStatus.className = 'status-message error'; return; }

        uploadStatus.textContent = 'Processando e carregando dados...'; uploadStatus.className = 'status-message info';

        // Limpa TUDO antes de carregar
        state.layers.lotes.clearLayers(); 
        state.layers.app.clearLayers(); 
        state.layers.poligonais.clearLayers(); 
        state.layers.areasRisco.clearLayers(); // NOVO: Limpa áreas de risco
        state.allLotes = []; 
        state.allAPPGeoJSON.features = []; 
        state.allPoligonaisGeoJSON.features = []; 
        state.allAreasRiscoGeoJSON.features = []; 
        state.nucleusSet.clear();

        const newLotesFeatures = []; const newAPPFeatures = []; const newPoligonaisFeatures = []; const newAreasRiscoFeatures = [];

        for (const file of filesToProcess) {
            try {
                console.log(`Processando arquivo: ${file.name}`); 
                const reader = new FileReader();
                const fileContent = await new Promise((resolve, reject) => { reader.onload = (e) => resolve(e.target.result); reader.onerror = (e) => reject(e); reader.readAsText(file); });
                let geojsonData = JSON.parse(fileContent);

                if (state.utmOptions.useUtm) {
                    try { geojsonData = reprojectGeoJSONFromUTM(geojsonData, state.utmOptions.zone, state.utmOptions.south); console.log(`Reprojeção de ${file.name} concluída.`); } 
                    catch (e) { console.error(`Falha na reprojeção de ${file.name}:`, e); uploadStatus.textContent = `Erro: Falha na reprojeção UTM de ${file.name}.`; uploadStatus.className = 'status-message error'; return; }
                }

                if (!geojsonData.type || !geojsonData.features) throw new Error('Arquivo GeoJSON inválido');
                if (geojsonData.type !== 'FeatureCollection') console.warn(`Arquivo ${file.name} não é um FeatureCollection`);

                const fileNameLower = file.name.toLowerCase();
                if (fileNameLower.includes('lote') && !fileNameLower.includes('risco')) { 
                    newLotesFeatures.push(...geojsonData.features);
                    // Popula o nucleusSet aqui mesmo
                    geojsonData.features.forEach(f => { if (f.properties && f.properties.desc_nucleo) state.nucleusSet.add(f.properties.desc_nucleo); });
                } else if (fileNameLower.includes('area de risco') || fileNameLower.includes('risco')) { 
                    newAreasRiscoFeatures.push(...geojsonData.features);
                }
                 else if (fileNameLower.includes('app')) { 
                    newAPPFeatures.push(...geojsonData.features);
                } else { 
                    newPoligonaisFeatures.push(...geojsonData.features);
                }
                console.log(`Arquivo ${file.name} categorizado.`); 

            } catch (error) { 
                console.error(`Erro fatal ao carregar ou parsear ${file.name}:`, error); 
                uploadStatus.textContent = `Erro fatal ao processar ${file.name}. Detalhes: ${error.message}`; 
                uploadStatus.className = 'status-message error'; 
                // Zera tudo em caso de erro fatal
                state.layers.lotes.clearLayers(); state.layers.app.clearLayers(); state.layers.poligonais.clearLayers(); state.layers.areasRisco.clearLayers();
                state.allLotes = []; state.allAPPGeoJSON.features = []; state.allPoligonaisGeoJSON.features = []; state.allAreasRiscoGeoJSON.features = []; state.nucleusSet.clear();
                
                // Reinicia a UI com dados vazios
                populateNucleusFilter(); refreshDashboard(); fillLotesTable();
                
                return; // Interrompe o processo
            }
        }

        // Armazena as features globais (antes de adicionar às camadas do Leaflet)
        state.allLotes = newLotesFeatures; 
        state.allAPPGeoJSON.features = newAPPFeatures;
        state.allPoligonaisGeoJSON.features = newPoligonaisFeatures;
        state.allAreasRiscoGeoJSON.features = newAreasRiscoFeatures;
        
        renderLayersOnMap(); // Chamar renderLayersOnMap SEM ARGUMENTOS para ele usar state.allLotes

        // Atualiza a UI após o carregamento e renderização
        populateNucleusFilter();
        refreshDashboard();
        fillLotesTable(); 

        uploadStatus.textContent = 'Dados carregados com sucesso! Vá para o Dashboard ou Dados Lotes.';
        uploadStatus.className = 'status-message success';
        console.log('Todos os arquivos processados e dados carregados no mapa e dashboard.'); 
    });
}
// ===================== Legenda / Toggle Camadas =====================
function initLegendToggles() {
    const toggle = (id, layer) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => {
            if (el.checked) layer.addTo(state.map); else state.map.removeLayer(layer);
            // Após togglar, reajusta o mapa para as camadas VISÍVEIS
            const allVisibleLayersGroup = L.featureGroup([
                state.layers.lotes,
                document.getElementById('toggleAPP')?.checked ? state.layers.app : null,
                document.getElementById('togglePoligonais')?.checked ? state.layers.poligonais : null,
                document.getElementById('toggleAreasRisco')?.checked ? state.layers.areasRisco : null
            ].filter(Boolean));
            if (allVisibleLayersGroup.getLayers().length > 0) {
                 try { state.map.fitBounds(allVisibleLayersGroup.getBounds(), { padding: [50, 50] }); } catch (e) {}
            }
        });
    };
    toggle('toggleLotes', state.layers.lotes);
    toggle('togglePoligonais', state.layers.poligonais);
    toggle('toggleAPP', state.layers.app);
    toggle('toggleAreasRisco', state.layers.areasRisco); // NOVO: Adiciona toggle para áreas de risco
}
// ===================== Estilos e Popups para Áreas de Risco =====================
function styleAreaRisco(feature) {
    // Busca por 'grau', 'risco' ou 'status_risco' da feature da área de risco
    const risco = String(feature.properties.risco || feature.properties.status_risco || feature.properties.grau || 'N/A').toLowerCase();
    let color;
    let borderColor = 'black'; // Borda padrão
    let dashArray = '5,5'; // Linha tracejada padrão

    switch (risco) {
        case '1':
        case 'baixo':
            color = '#8BC34A'; // Verde claro para preenchimento
            borderColor = '#558B2F'; // Verde escuro para borda
            break;
        case '2':
        case 'médio':
        case 'medio':
            color = '#FFC107'; // Amarelo para preenchimento
            borderColor = '#FFA000'; // Laranja para borda
            break;
        case '3':
        case 'alto':
        case 'geologico':
        case 'hidrologico':
            color = '#FF5722'; // Laranja avermelhado para preenchimento
            borderColor = '#D84315'; // Vermelho para borda
            dashArray = '10,5'; // Linha mais destacada
            break;
        case '4':
        case 'muito alto':
            color = '#D32F2F'; // Vermelho escuro para preenchimento
            borderColor = '#B71C1C'; // Vermelho intenso para borda
            dashArray = '1, 5'; // Linha pontilhada (alerta)
            break;
        default:
            color = '#90A4AE'; // Cinza padrão para preenchimento
            borderColor = '#546E7A'; // Cinza escuro para borda
            break;
    }

    return {
        fillColor: color,
        weight: 2, // Borda um pouco mais grossa para destacar áreas
        opacity: 0.8,
        color: borderColor, 
        dashArray: dashArray, 
        fillOpacity: 0.4 // Transparência para ver o mapa base por baixo
    };
}

// ... (onEachAreaRiscoFeature e o restante do código permanecem como na última entrega) ...
function onEachLoteFeature(feature, layer) {
    if (feature.properties) {
        let popupContent = "<h3>Detalhes do Lote:</h3>";
        for (let key in feature.properties) {
            let value = feature.properties[key];
            if (value === null || value === undefined || value === '') value = 'N/A'; 
            if (key.toLowerCase() === 'area_m2' && typeof value === 'number') value = value.toLocaleString('pt-BR') + ' m²';
            if ((key.toLowerCase() === 'valor' || key.toLowerCase() === 'custo de intervenção') && typeof value === 'number') value = formatBRL(value);
            if (key.toLowerCase() === 'dentro_app' && typeof value === 'number') value = (value > 0) ? `Sim (${value}%)` : 'Não'; 

            let displayKey = key;
            switch(key.toLowerCase()){
                case 'cod_lote': displayKey = 'Código do Lote'; break;
                case 'desc_nucleo': displayKey = 'Núcleo'; break;
                case 'tipo_uso': displayKey = 'Tipo de Uso'; break;
                case 'area_m2': displayKey = 'Área (m²)'; break;
                case 'risco': displayKey = 'Status de Risco'; break;
                case 'dentro_app': displayKey = 'Em APP'; break;
                case 'valor': displayKey = 'Custo de Intervenção'; break;
                case 'tipo_edificacao': displayKey = 'Tipo de Edificação'; break;
                case 'nm_mun': displayKey = 'Município'; break; 
                case 'nome_logradouro': displayKey = 'Logradouro'; break;
                case 'numero_postal': displayKey = 'CEP'; break;
                case 'status_risco': displayKey = 'Status Risco'; break; 
                case 'cod_area': displayKey = 'Cód. Área'; break;
                case 'grau': displayKey = 'Grau'; break;
                case 'qtde_lote': displayKey = 'Qtde. Lote(s)'; break;
                case 'intervencao': displayKey = 'Intervenção'; break;
                case 'lotes_atingidos': displayKey = 'Lotes Atingidos'; break;
            }
            popupContent += `<strong>${displayKey}:</strong> ${value}<br>`;
        }
        layer.bindPopup(popupContent);
    }
}

function styleApp(feature) { return { color: '#9b59b6', weight: 2, opacity: 0.7, fillColor: '#d7bde2', fillOpacity: 0.2 }; }
function onEachAppFeature(feature, layer) { if (feature.properties) { let popupContent = "<h3>Área de Preservação Permanente (APP)</h3>"; for (let key in feature.properties) popupContent += `<strong>${key}:</strong> ${feature.properties[key]}<br>`; layer.bindPopup(popupContent); } }

function stylePoligonal(feature) { return { color: '#2ecc71', weight: 2, opacity: 0.7, fillOpacity: 0.2 }; }
async function onEachPoligonalFeature(feature, layer) {
    if (feature.properties) {
        const props = feature.properties;
        const municipioNome = props.municipio || props.nm_mun || 'Não informado'; 

        let popupContent = `<h3>Informações da Poligonal: ${municipioNome}</h3>`;
        popupContent += `<strong>Município:</strong> ${municipioNome}<br>`;
        if (props.area_m2) popupContent += `<strong>Área (m²):</strong> ${props.area_m2.toLocaleString('pt-BR')} m²<br>`;
        for (let key in props) { if (!['municipio', 'nm_mun', 'area_m2'].includes(key.toLowerCase())) popupContent += `<strong>${key}:</strong> ${props[key]}<br>`; }
        popupContent += `<button onclick="buscarInfoCidade('${municipioNome}')" style="margin-top:8px;">Ver informações do município</button>`;
        layer.bindPopup(popupContent);
    }
}

function buscarInfoCidade(nomeCidade) {
    alert(`Buscando dados simulados para ${nomeCidade}...`);
    const dadosSimulados = getSimulatedMunicipioData(nomeCidade); 
    let info = `**Informações para ${dadosSimulados.municipio}:**\n- Região: ${dadosSimulados.regiao}\n- População Estimada: ${dadosSimulados.populacao}\n- Área Territorial: ${dadosSimulados.area_km2} km²\n\n(Estes dados são simulados. Para dados reais, um backend seria necessário.)`;
    alert(info);
    console.log("Dados do município simulados:", dadosSimulados);
}

// ===================== Renderização de Camadas no Mapa =====================
function renderLayersOnMap(featuresToDisplay = state.allLotes) {
    console.log('renderLayersOnMap: Renderizando camadas...');
    
    // Limpa todas as camadas antes de redesenhar
    state.layers.lotes.clearLayers();
    state.layers.app.clearLayers();
    state.layers.poligonais.clearLayers();
    state.layers.areasRisco.clearLayers(); // NOVO: Limpa áreas de risco

    // Adiciona Lotes (filtrados ou todos)
    if (featuresToDisplay.length > 0) {
        L.geoJSON(featuresToDisplay, {
            onEachFeature: onEachLoteFeature,
            style: styleLote
        }).addTo(state.layers.lotes);
        console.log(`renderLayersOnMap: ${featuresToDisplay.length} lotes adicionados à camada.`);
    }

    // Adiciona APP (todos os dados APP carregados)
    if (state.allAPPGeoJSON.features.length > 0) {
        L.geoJSON(state.allAPPGeoJSON.features, {
            onEachFeature: onEachAppFeature,
            style: styleApp
        }).addTo(state.layers.app);
        console.log(`renderLayersOnMap: ${state.allAPPGeoJSON.features.length} feições de APP adicionadas à camada.`);
    }

    // Adiciona Poligonais (todos os dados Poligonais carregados, exceto as áreas de risco específicas)
    if (state.allPoligonaisGeoJSON.features.length > 0) {
        L.geoJSON(state.allPoligonaisGeoJSON.features, {
            onEachFeature: onEachPoligonalFeature,
            style: stylePoligonal
        }).addTo(state.layers.poligonais);
        console.log(`renderLayersOnMap: ${state.allPoligonaisGeoJSON.features.length} feições de Poligonais adicionadas à camada.`);
    }

    // NOVO: Adiciona Áreas de Risco (com estilo próprio)
    if (state.allAreasRiscoGeoJSON.features.length > 0) {
        L.geoJSON(state.allAreasRiscoGeoJSON.features, {
            onEachFeature: onEachAreaRiscoFeature, // NOVA função para popup de área de risco
            style: styleAreaRisco // NOVA função para estilo de área de risco
        }).addTo(state.layers.areasRisco);
        console.log(`renderLayersOnMap: ${state.allAreasRiscoGeoJSON.features.length} feições de Áreas de Risco adicionadas à camada.`);
    }

    // Ajusta o zoom do mapa para a extensão dos dados carregados
    const allVisibleLayersGroup = L.featureGroup([
        state.layers.lotes,
        document.getElementById('toggleAPP')?.checked ? state.layers.app : null,
        document.getElementById('togglePoligonais')?.checked ? state.layers.poligonais : null,
        document.getElementById('toggleAreasRisco')?.checked ? state.layers.areasRisco : null // NOVO: Inclui áreas de risco
    ].filter(Boolean)); // Remove nulos

    if (allVisibleLayersGroup.getLayers().length > 0) {
        try {
            const bounds = allVisibleLayersGroup.getBounds();
            if (bounds.isValid()) {
                state.map.fitBounds(bounds, { padding: [50, 50] });
                console.log('Mapa ajustado para os bounds dos dados carregados:', bounds);
            } else {
                console.warn("Bounds inválidos. O mapa não será ajustado. Verifique as coordenadas dos seus GeoJSONs.");
                state.map.setView([-15.7801, -47.9292], 5); // Centraliza no Brasil como fallback
            }
        } catch (e) {
            console.error("Erro ao ajustar o mapa aos bounds. Verifique as coordenadas.", e);
            state.map.setView([-15.7801, -47.9292], 5); // Centraliza no Brasil como fallback
        }
    } else {
        state.map.setView([-15.7801, -47.9292], 5); // Centraliza no Brasil se não houver dados
        console.log('Nenhum dado carregado, mapa centralizado no Brasil.');
    }
}
/** Filtra os lotes com base no núcleo selecionado. */
function filteredLotes() {
    if (state.currentNucleusFilter === 'all') return state.allLotes;
    return state.allLotes.filter(f => f.properties?.desc_nucleo === state.currentNucleusFilter);
}

/** Aplica zoom ao mapa para a extensão dos lotes filtrados. */
function zoomToFilter() {
    const feats = filteredLotes();
    if (feats.length === 0) { state.map.setView([-15.7801, -47.9292], 5); return; }
    const layer = L.geoJSON({ type: 'FeatureCollection', features: feats });
    try { state.map.fitBounds(layer.getBounds(), { padding: [20,20] }); } catch (e) { console.warn("Não foi possível ajustar o mapa ao filtro.", e); }
}

// ===================== Funções de Inicialização Principal (Chamadas no DOMContentLoaded) =====================
document.addEventListener('DOMContentLoaded', () => {
    // ... (código existente) ...

    document.getElementById('applyFiltersBtn').addEventListener('click', () => {
        state.currentNucleusFilter = document.getElementById('nucleusFilter').value; 
        refreshDashboard();
        fillLotesTable();
        renderLayersOnMap(filteredLotes()); // Redesenha APENAS os lotes filtrados
        zoomToFilter(); // Aplica o zoom aos lotes filtrados
    });

    // ... (código generateReportBtn e exportReportBtn, sem alterações) ...
    
    document.getElementById('nucleusFilter').addEventListener('change', () => {
        state.currentNucleusFilter = document.getElementById('nucleusFilter').value;
        refreshDashboard();
        fillLotesTable();
        renderLayersOnMap(filteredLotes()); // Redesenha APENAS os lotes filtrados
        zoomToFilter(); // Zoom quando o filtro muda no Dashboard
    });

    // ... (restante do DOMContentLoaded, sem alterações) ...
});
// ===================== Dashboard =====================
function refreshDashboard() {
    console.log('refreshDashboard: Atualizando cards do dashboard.');
    const feats = filteredLotes();
    const totalLotesCount = feats.length;

    let lotesEmRiscoGeral = 0; 
    let lotesAppCount = 0;
    let custoTotal = 0;
    let custoMin = Infinity; // Inicializa com Infinity
    let custoMax = -Infinity; // Inicializa com -Infinity
    let riskCounts = { 'Baixo': 0, 'Médio': 0, 'Alto': 0, 'Muito Alto': 0 };

    feats.forEach(f => {
        const p = f.properties || {};
        const risco = String(p.risco || p.status_risco || p.grau || 'N/A').toLowerCase();

        // Lógica de contagem de risco (ajustada para ser mais abrangente)
        if (risco.includes('baixo') || risco === '1') {
            riskCounts['Baixo']++;
        } else if (risco.includes('médio') || risco.includes('medio') || risco === '2') {
            riskCounts['Médio']++;
        } else if (risco.includes('alto') || risco === '3' || risco.includes('geologico') || risco.includes('hidrologico')) {
            riskCounts['Alto']++;
        } else if (risco.includes('muito alto') || risco === '4') {
            riskCounts['Muito Alto']++;
        } else if (risco !== 'n/a' && risco.trim() !== '') {
            console.warn(`Risco não mapeado encontrado: "${risco}" para lote`, p);
        }
        
        // Contagem para o card "Lotes em Risco" (qualquer risco que não seja 'Baixo' ou 'N/A')
        if (risco !== '1' && !risco.includes('baixo') && risco !== 'n/a' && risco.trim() !== '') {
            lotesEmRiscoGeral++;
        }
        
        // Contagem de Lotes em APP
        const dentroApp = Number(p.dentro_app || p.app || 0);
        if (dentroApp > 0) {
            lotesAppCount++;
        }

        // Cálculo do Custo de Intervenção
        const valorCusto = Number(p.valor || p.custo_intervencao || 0);
        if (!isNaN(valorCusto) && valorCusto > 0) {
            custoTotal += valorCusto;
            if (valorCusto < custoMin) custoMin = valorCusto;
            if (valorCusto > custoMax) custoMax = valorCusto;
        }
    });

    // Atualiza os elementos do HTML
    document.getElementById('totalLotes').textContent = totalLotesCount;
    document.getElementById('lotesRisco').textContent = lotesEmRiscoGeral; 
    document.getElementById('lotesApp').textContent = lotesAppCount;
    document.getElementById('custoEstimado').textContent = formatBRL(custoTotal);

    document.getElementById('riskLowCount').textContent = riskCounts['Baixo'];
    document.getElementById('riskMediumCount').textContent = riskCounts['Médio'];
    document.getElementById('riskHighCount').textContent = riskCounts['Alto'];
    document.getElementById('riskVeryHighCount').textContent = riskCounts['Muito Alto'];

    // Para o resumo, usamos a mesma contagem do card
    document.getElementById('areasIdentificadas').textContent = lotesEmRiscoGeral; 
    document.getElementById('areasIntervencao').textContent = lotesEmRiscoGeral; 

    // Atualiza os custos mínimo e máximo, verificando se foram encontrados valores válidos
    document.getElementById('minCustoIntervencao').textContent = `Custo Mínimo de Intervenção: ${custoMin === Infinity ? 'N/D' : formatBRL(custoMin)}`;
    document.getElementById('maxCustoIntervencao').textContent = `Custo Máximo de Intervenção: ${custoMax === -Infinity ? 'N/D' : formatBRL(custoMax)}`;

    // Exibir Município Principal no Dashboard
    let mainMunicipio = 'N/A';
    // Prioriza o município do primeiro lote
    if (state.allLotes.length > 0 && state.allLotes[0].properties) {
        mainMunicipio = state.allLotes[0].properties.nm_mun || state.allLotes[0].properties.municipio || 'N/A';
    } 
    // Se não houver lotes, tenta pegar do primeiro poligonal (se existir)
    else if (state.allPoligonaisGeoJSON.features.length > 0) { 
        const firstPoligonalProps = state.allPoligonaisGeoJSON.features[0].properties;
        if (firstPoligonalProps) {
            mainMunicipio = firstPoligonalProps.municipio || firstPoligonalProps.nm_mun || 'N/A';
        }
    }
    document.getElementById('mainMunicipioDisplay').textContent = mainMunicipio;
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
        const codLote = p.cod_lote || p.codigo || 'N/A';
        tr.innerHTML = `
            <td>${codLote}</td>
            <td>${p.desc_nucleo || 'N/A'}</td>
            <td>${p.tipo_uso || 'N/A'}</td>
            <td>${p.area_m2 ? p.area_m2.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : 'N/A'}</td>
            <td>${p.risco || p.status_risco || p.grau || 'N/A'}</td>
            <td>${(Number(p.dentro_app) > 0) ? 'Sim' : 'Não'}</td>
            <td><button class="zoomLoteBtn small-btn" data-codlote="${codLote}">Ver no Mapa</button></td>
        `;
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);

    tbody.querySelectorAll('.zoomLoteBtn').forEach(btn => {
        btn.addEventListener('click', () => {
            const codLoteToZoom = btn.getAttribute('data-codlote');
            // Busca pelo lote no ALL LOTES para garantir que a geometria esteja disponível
            const loteToZoom = state.allLotes.find(l => (l.properties?.cod_lote || l.properties?.codigo) == codLoteToZoom);
            
            if (loteToZoom) {
                // Navega para o dashboard (onde está o mapa)
                document.querySelector('nav a[data-section="dashboard"]').click();
                
                // Cria uma camada Leaflet temporária para obter os limites (bounds) do lote
                const tempLayer = L.geoJSON(loteToZoom); 
                try { 
                    state.map.fitBounds(tempLayer.getBounds(), { padding: [50, 50] }); 
                } catch (e) {
                    console.warn("Não foi possível ajustar o mapa ao lote selecionado. Verifique as coordenadas do lote.", e);
                }
                // Tenta abrir o popup do lote no mapa
                state.layers.lotes.eachLayer(layer => {
                    if ((layer.feature?.properties?.cod_lote || layer.feature?.properties?.codigo) == codLoteToZoom && layer.openPopup) {
                        layer.openPopup();
                    }
                });
            } else {
                console.warn(`Lote com código ${codLoteToZoom} não encontrado na lista para zoom.`);
            }
        });
    });
}
// ===================== Geração de Relatório com IA (Simulado) =====================
async function gerarRelatorioIA() {
    console.log('Gerando Relatório com IA (simulado)...'); 
    const reportType = document.getElementById('reportType').value;
    const nucleosAnalise = document.getElementById('nucleosAnalise').value;
    const incDadosGerais = document.getElementById('incDadosGerais').checked;
    const incAnaliseRiscos = document.getElementById('incAnaliseRiscos').checked;
    const incAreasPublicas = document.getElementById('incAreasPublicas').checked;
    const incInformacoesGerais = document.getElementById('incInformacoesGerais').checked; 
    const incInfraestrutura = document.getElementById('incInfraestrutura').checked;
    const generatedReportContent = document.getElementById('generatedReportContent');

    if (state.allLotes.length === 0) {
        generatedReportContent.textContent = "Nenhum dado de lotes disponível para gerar o relatório. Faça o upload das camadas primeiro.";
        return;
    }
    if (incInformacoesGerais && Object.keys(state.generalProjectInfo).length === 0) {
        generatedReportContent.textContent = "Seção 'Informações Gerais do Projeto' selecionada, mas nenhum dado foi salvo. Por favor, preencha e salve as informações na aba 'Informações Gerais'.";
        return;
    }

    let reportText = `RELATÓRIO GEOLAUDO.AI - ${reportType.toUpperCase()}\n`;
    reportText += `Data de Geração: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}\n\n`;

    let featuresToAnalyze = filteredLotes(); 
    let municipioDoNucleo = "Não informado"; 
    if (nucleosAnalise !== 'all' && nucleosAnalise !== 'none' && featuresToAnalyze.length > 0) {
        reportText += `Análise Focada no Núcleo: ${nucleosAnalise}\n\n`;
        municipioDoNucleo = featuresToAnalyze[0].properties?.nm_mun || featuresToAnalyze[0].properties?.municipio || "Não informado";
    } else {
        reportText += `Análise Abrangente (Todos os Núcleos)\n\n`;
        if (state.allLotes.length > 0) {
             municipioDoNucleo = state.allLotes[0].properties?.nm_mun || state.allLotes[0].properties?.municipio || "Não informado";
        }
    }

    const dadosIbge = getSimulatedMunicipioData(municipioDoNucleo);
    if (dadosIbge && dadosIbge.municipio && dadosIbge.municipio !== "Não informado") {
        reportText += `--- Informações do Município (${dadosIbge.municipio}) ---\n`;
        reportText += `  - Região: ${dadosIbge.regiao}\n`;
        reportText += `  - População Estimada: ${dadosIbge.populacao}\n`;
        reportText += `  - Área Territorial: ${dadosIbge.area_km2} km²\n\n`;
    } else {
        reportText += `--- Informações do Município ---\n`;
        reportText += `  - Dados do município (${municipioDoNucleo}) não encontrados ou não informados nos lotes. (Simulado)\n\n`;
    }

    if (incDadosGerais) {
        reportText += `--- 1. Dados Gerais da Área Analisada ---\n`;
        reportText += `Total de Lotes Analisados: ${featuresToAnalyze.length}\n`;
        
        const totalArea = featuresToAnalyze.reduce((acc, f) => acc + (f.properties.area_m2 || 0), 0); 
        reportText += `Área Total dos Lotes: ${totalArea.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²\n\n`;

        const uniqueTiposUso = new Set(featuresToAnalyze.map(f => f.properties.tipo_uso).filter(Boolean));
        if (uniqueTiposUso.size > 0) {
            reportText += `Principais Tipos de Uso Identificados: ${Array.from(uniqueTiposUso).join(', ')}\n\n`;
        }
    }

    if (incAnaliseRiscos) {
        const riskCounts = { 'Baixo': 0, 'Médio': 0, 'Alto': 0, 'Muito Alto': 0 };
        featuresToAnalyze.forEach(f => {
            const risco = String(f.properties.risco || f.properties.status_risco || f.properties.grau || 'N/A').toLowerCase();
            if (risco === '1' || risco.includes('baixo')) riskCounts['Baixo']++;
            else if (risco === '2' || risco.includes('médio') || risco.includes('medio')) riskCounts['Médio']++;
            else if (risco === '3' || risco.includes('alto') || risco.includes('geologico') || risco.includes('hidrologico')) riskCounts['Alto']++;
            else if (risco === '4' || risco.includes('muito alto')) riskCounts['Muito Alto']++;
        });
        const lotesComRiscoElevado = riskCounts['Médio'] + riskCounts['Alto'] + riskCounts['Muito Alto'];
        const percRiscoElevado = (lotesComRiscoElevado / featuresToAnalyze.length * 100 || 0).toFixed(2);

        reportText += `--- 2. Análise de Riscos Geológicos e Ambientais ---\n`;
        reportText += `Distribuição de Risco dos Lotes:\n`;
        reportText += `- Baixo Risco: ${riskCounts['Baixo'] || 0} lotes\n`;
        reportText += `- Médio Risco: ${riskCounts['Médio'] || 0} lotes\n`;
        reportText += `- Alto Risco: ${riskCounts['Alto'] || 0} lotes\n`;
        reportText += `- Muito Alto Risco: ${riskCounts['Muito Alto'] || 0} lotes\n\n`;
        reportText += `Total de Lotes com Risco Elevado (Médio, Alto, Muito Alto): ${lotesComRiscoElevado} (${percRiscoElevado}% do total)\n`;
        
        if (lotesComRiscoElevado > 0) {
            reportText += `Recomendação: Áreas com risco médio a muito alto demandam estudos geotécnicos aprofundados e, possivelmente, intervenções estruturais para mitigação de riscos ou realocação, conforme a legislação vigente de REURB e plano de contingência municipal.\n\n`;
        } else {
            reportText += `Recomendação: A área analisada apresenta um perfil de baixo risco predominante, o que facilita o processo de regularização fundiária.\n\n`;
        }
    }

    if (incAreasPublicas) {
        const lotesEmAPP = featuresToAnalyze.filter(f => typeof f.properties.dentro_app === 'number' && f.properties.dentro_app > 0).length;
        reportText += `--- 3. Análise de Áreas de Preservação Permanente (APP) ---\n`;
        reportText += `Número de lotes que intersectam ou estão em APP: ${lotesEmAPP}\n`;
        if (lotesEmAPP > 0) {
            reportText += `Observação: A presença de lotes em Áreas de Preservação Permanente exige a aplicação de medidas específicas de regularização ambiental, como a recuperação da área degradada ou a compensação ambiental, conforme o Código Florestal e demais normativas ambientais aplicáveis à REURB.\n\n`;
        } else {
            reportText += `Observação: Não foram identificados lotes em Áreas de Preservação Permanente no conjunto de dados analisado, o que simplifica o licenciamento ambiental da regularização.\n\n`;
        }
    }

    if (incInformacoesGerais && Object.keys(state.generalProjectInfo).length > 0) {
        const info = state.generalProjectInfo; 

        reportText += `--- 4. Informações de Contexto Geral e Infraestrutura do Projeto ---\n`;
        
        reportText += `**Infraestrutura Básica:**\n`;
        reportText += `  - Unidades de Conservação Próximas: ${info.ucConservacao || 'Não informado'}.\n`;
        reportText += `  - Proteção de Mananciais na Área: ${info.protecaoMananciais || 'Não informado'}.\n`;
        reportText += `  - Abastecimento de Água: ${info.tipoAbastecimento || 'Não informado'}${info.responsavelAbastecimento ? ' (Responsável: ' + info.responsavelAbastecimento + ')' : ''}.\n`;
        reportText += `  - Coleta de Esgoto: ${info.tipoColetaEsgoto || 'Não informado'}${info.responsavelColetaEsgoto ? ' (Responsável: ' + info.responsavelColetaEsgoto + ')' : ''}.\n`;
        reportText += `  - Sistema de Drenagem: ${info.sistemaDrenagem || 'Não informado'}.\n`;
        reportText += `  - Lotes com Drenagem Inadequada: ${info.drenagemInadequada || 'Não informado'}.\n`;
        reportText += `  - Logradouros: ${info.logradourosIdentificados || 'Não informado'}.\n\n`;

        reportText += `**Restrições e Conflitos:**\n`;
        if (info.linhaTransmissao === 'Sim' || info.minerodutoGasoduto === 'Sim' || info.linhaFerrea === 'Sim' || info.aeroporto === 'Sim' || info.limitacoesOutras === 'Sim') {
            reportText += `  - Foram identificadas as seguintes restrições/infraestruturas de grande porte:\n`;
            if (info.linhaTransmissao === 'Sim') reportText += `    - Linha de Transmissão de Energia.\n`;
            if (info.minerodutoGasoduto === 'Sim') reportText += `    - Mineroduto / Gasoduto.\n`;
            if (info.linhaFerrea === 'Sim') reportText += `    - Linha Férrea.\n`;
            if (info.aeroporto === 'Sim') reportText += `    - Proximidade de Aeroporto.\n`;
            if (info.limitacoesOutras === 'Sim') reportText += `    - Outras limitações de natureza diversa.\n`;
        } else {
            reportText += `  - Não foram identificadas restrições significativas de infraestruturas de grande porte ou outras limitações específicas.\n`;
        }
        reportText += `  - Processo no Ministério Público: ${info.processoMP || 'Não informado'}.\n`;
        reportText += `  - Processos Judiciais Existentes: ${info.processosJudiciais || 'Não informado'}.\n`;
        reportText += `  - Comarcas do CRI: ${info.comarcasCRI || 'Não informado/Não aplicável'}.\n\n`;

        reportText += `**Aspectos Legais e Fundiários:**\n`;
        reportText += `  - Titularidade da Área: ${info.titularidadeArea || 'Não informado'}.\n`;
        reportText += `  - Programa Terra Legal: ${info.terraLegal || 'Não informado'}.\n`;
        reportText += `  - Instrumento Jurídico Principal: ${info.instrumentoJuridico || 'Não informado'}.\n`;
        reportText += `  - Legislação Municipal REURB: ${info.legislacaoReurb || 'Não informada'}.\n`;
        reportText += `  - Legislação Municipal Ambiental: ${info.legislacaoAmbiental || 'Não informada'}.\n`;
        reportText += `  - Plano Diretor Municipal: ${info.planoDiretor || 'Não informado'}.\n`;
        reportText += `  - Lei de Uso e Ocupação do Solo/Zoneamento: ${info.zoneamento || 'Não informado'}.\n`;
        reportText += `  - Município de Origem do Núcleo: ${info.municipioOriginal || 'Não informado/Atual'}.\n`;
        reportText += `  - Matrículas de Origem/Afetadas: ${info.matriculasOrigem || 'Não informadas.'}\n`;
        reportText += `  - Matrículas Identificadas: ${info.matriculasIdentificadas || 'Não informadas.'}\n\n`;

        reportText += `**Ações e Medidas Propostas:**\n`;
        reportText += `  - Adequação para Correção de Desconformidades: ${info.adequacaoDesconformidades || 'Não informado'}.\n`;
        reportText += `  - Obras de Infraestrutura Essencial: ${info.obrasInfraestrutura || 'Não informado'}.\n`;
        reportText += `  - Medidas Compensatórias: ${info.medidasCompensatorias || 'Não informado'}.\n\n`;

        reportText += `Esta seção reflete informações gerais sobre a área do projeto, essenciais para uma análise contextualizada e para a tomada de decisões no processo de REURB.\n\n`;
    } else if (incInformacoesGerais) {
        reportText += `--- 4. Informações de Contexto Geral e Infraestrutura do Projeto ---\n`;
        reportText += `Nenhuma informação geral foi preenchida ou salva na aba 'Informações Gerais'. Por favor, preencha os dados e clique em 'Salvar Informações Gerais' antes de gerar o relatório com esta seção.\n\n`;
    }

    if (incInfraestrutura && state.layers.poligonais.getLayers().length > 0) { 
        reportText += `--- 5. Análise de Infraestrutura e Equipamentos Urbanos (Camadas Geoespaciais) ---\n`;
        reportText += `Foram detectadas ${state.layers.poligonais.getLayers().length} poligonais de infraestrutura ou outras áreas de interesse (como vias, áreas verdes, equipamentos comunitários) nas camadas carregadas.\n`;
        reportText += `A presença e adequação da infraestrutura existente é um fator chave para a viabilidade e qualidade da regularização. Recomenda-se verificação detalhada da situação da infraestrutura básica (água, esgoto, energia, drenagem, acesso) em relação aos lotes.\n\n`;
    }
    
    const custoTotalFiltrado = featuresToAnalyze.reduce((acc, f) => acc + (f.properties.valor || 0), 0); 
    reportText += `--- 6. Custo de Intervenção Estimado ---\n`;
    reportText += `Custo Total Estimado para Intervenção nos Lotes Analisados: R$ ${custoTotalFiltrado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    reportText += `Este valor é uma estimativa e deve ser refinado com levantamentos de campo e orçamentos detalhados.\n\n`;


    reportText += `--- Fim do Relatório ---\n`;
    reportText += `Este relatório foi gerado automaticamente pelo GeoLaudo.AI. Para análises mais aprofundadas e validação legal, consulte um especialista qualificado e os órgãos competentes.`;

    state.lastReportText = reportText; 
    generatedReportContent.textContent = reportText; 
    generatedReportContent.scrollTop = 0; 
}

// ===================== Funções de Inicialização Principal (Chamadas no DOMContentLoaded) =====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded: Página e DOM carregados. Iniciando componentes...'); 
    initMap(); 
    initNav(); 
    initUpload(); 
    initLegendToggles(); 
    initGeneralInfoForm(); 

    document.getElementById('applyFiltersBtn').addEventListener('click', () => {
        state.currentNucleusFilter = document.getElementById('nucleusFilter').value; 
        refreshDashboard();
        fillLotesTable();
        zoomToFilter();
    });

    document.getElementById('generateReportBtn').addEventListener('click', gerarRelatorioIA);

    document.getElementById('exportReportBtn').addEventListener('click', () => {
        if (!state.lastReportText.trim()) {
            alert('Nenhum relatório para exportar. Gere um relatório primeiro.');
            return;
        }
        downloadText('relatorio_geolaudo.txt', state.lastReportText);
    });
    
    document.getElementById('nucleusFilter').addEventListener('change', () => {
        state.currentNucleusFilter = document.getElementById('nucleusFilter').value;
        refreshDashboard();
        fillLotesTable();
        zoomToFilter(); 
    });

    document.getElementById('dashboard').classList.add('active');
    document.querySelector('nav a[data-section="dashboard"]').classList.add('active');
    refreshDashboard(); 
    fillLotesTable(); 
    populateNucleusFilter(); 
    console.log('DOMContentLoaded: Configurações iniciais do app aplicadas.'); 
});
