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
    utmOptions: { useUtm: false, zone: 23, south: true }, // Configurações para reprojeção UTM client-side
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
// Esta seção permite que o app tente reprojetar GeoJSONs em UTM, se necessário.

/** Converte um ponto UTM (x,y) para Lat/Lng (WGS84). */
function utmToLngLat(x, y, zone, south) {
    // Definição dinâmica da projeção UTM (ex: SIRGAS 2000 / UTM zone 23S)
    const def = `+proj=utm +zone=${Number(zone)} ${south ? '+south ' : ''}+datum=WGS84 +units=m +no_defs`;
    // Retorna [longitude, latitude]
    const p = proj4(def, proj4.WGS84, [x, y]);
    return [p[0], p[1]]; 
}

/**
 * Converte um GeoJSON inteiro de UTM para WGS84.
 * Percorre as geometrias e aplica a conversão de coordenadas.
 * @param {object} geojson - O objeto GeoJSON (FeatureCollection, Feature, ou Geometry).
 * @param {number} zone - A zona UTM (1-60).
 * @param {boolean} south - True se for hemisfério Sul, False se Norte.
 * @returns {object} Um novo objeto GeoJSON com coordenadas em WGS84.
 */
function reprojectGeoJSONFromUTM(geojson, zone, south) {
    // Cria uma cópia profunda para não modificar o objeto original.
    const converted = JSON.parse(JSON.stringify(geojson)); 

    function convertGeometryCoords(coords, geomType) {
        if (!coords || coords.length === 0) return coords;

        if (geomType === 'Point') {
            return utmToLngLat(coords[0], coords[1], zone, south);
        } else if (geomType === 'LineString' || geomType === 'MultiPoint') {
            return coords.map(coord => utmToLngLat(coord[0], coord[1], zone, south));
        } else if (geomType === 'Polygon') {
            return coords.map(ring => ensurePolygonClosed(ring.map(coord => utmToLngLat(coord[0], coord[1], zone, south))));
        } else if (geomType === 'MultiLineString') {
            return coords.map(line => line.map(coord => utmToLngLat(coord[0], coord[1], zone, south)));
        } else if (geomType === 'MultiPolygon') {
            return coords.map(polygon => 
                polygon.map(ring => ensurePolygonClosed(ring.map(coord => utmToLngLat(coord[0], coord[1], zone, south))))
            );
        }
        return coords; // Retorna as coordenadas originais para tipos não mapeados
    }

    if (converted.type === 'FeatureCollection') {
        converted.features = converted.features.map(feature => {
            if (feature.geometry) {
                feature.geometry.coordinates = convertGeometryCoords(feature.geometry.coordinates, feature.geometry.type);
            }
            return feature;
        });
    } else if (converted.type === 'Feature') {
        if (converted.geometry) {
            converted.geometry.coordinates = convertGeometryCoords(converted.geometry.coordinates, converted.geometry.type);
        }
    } else { // Assume que é um objeto de geometria
        converted.coordinates = convertGeometryCoords(converted.coordinates, converted.type);
    }

    return converted;
}



// ===================== Simulações de IBGE e IA (para ambiente client-side) =====================
// Estas funções substituem as chamadas ao backend Flask no ambiente de produção do GitHub Pages.

const ibgeDataSimulado = {
    "Conselheiro Lafaiete": {
        municipio: "Conselheiro Lafaiete",
        regiao: "Sudeste",
        populacao: "131.200 (estimativa 2023)",
        area_km2: "367.359"
    },
    // Adicione mais dados simulados para outros municípios ou núcleos se quiser.
    // O GeoJSON de lotes precisa ter a propriedade 'nm_mun' ou 'municipio' para que isso funcione.
};

/** Simula a busca de dados do IBGE para um município. */
function getSimulatedMunicipioData(nomeMunicipio) {
    const data = ibgeDataSimulado[nomeMunicipio];
    if (data) {
        return data;
    }
    return {
        municipio: nomeMunicipio,
        regiao: "Não informado",
        populacao: "N/D (Dados simulados)",
        area_km2: "N/D (Dados simulados)"
    };
}

/** Simula a geração de um laudo com IA no navegador. */
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

    laudo += `**Análise Contextual:**\n`;
    laudo += `Baseado nos dados fornecidos e em conhecimentos gerais de REURB, a área apresenta características urbanísticas e fundiárias que demandam avaliação conforme a legislação. A infraestrutura básica e a regularidade documental são pontos cruciais para a consolidação da regularização.\n\n`;

    laudo += `**Recomendações:**\n`;
    laudo += `1. Verificação documental aprofundada dos títulos e matrículas.\n`;
    laudo += `2. Levantamento topográfico e cadastral detalhado para delimitação precisa dos lotes.\n`;
    laudo += `3. Análise ambiental para identificar e mitigar impactos, especialmente em áreas de preservação.\n`;
    laudo += `4. Planejamento de obras de infraestrutura quando necessário.\n\n`;

    laudo += `Este laudo é uma simulação e deve ser complementado por uma análise técnica e jurídica completa realizada por profissionais habilitados.\n\n`;

    return laudo;
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
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
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
    state.layers.app = L.featureGroup().addTo(state.map); 
    state.layers.poligonais = L.featureGroup().addTo(state.map); 

    // Remove as camadas APP e Poligonais do mapa por padrão, para que o usuário as ative pela legenda
    state.map.removeLayer(state.layers.app);
    state.map.removeLayer(state.layers.poligonais);

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
            // Garante que a tabela de lotes seja atualizada ao entrar na aba "Dados Lotes"
            if (targetSectionId === 'dados-lotes') {
                fillLotesTable();
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

    const selectFilesVisibleButton = document.getElementById('selectFilesVisibleButton');

    const useUtmCheckbox = document.getElementById('useUtmCheckbox');
    const utmOptionsContainer = document.getElementById('utmOptionsContainer');
    const utmZoneInput = document.getElementById('utmZoneInput');
    const utmHemisphereSelect = document.getElementById('utmHemisphereSelect');

    useUtmCheckbox.addEventListener('change', () => {
        state.utmOptions.useUtm = useUtmCheckbox.checked;
        utmOptionsContainer.style.display = useUtmCheckbox.checked ? 'flex' : 'none';
    });
    utmZoneInput.addEventListener('input', () => { 
        state.utmOptions.zone = Number(utmZoneInput.value) || 23; 
    });
    utmHemisphereSelect.addEventListener('change', () => { 
        state.utmOptions.south = (utmHemisphereSelect.value === 'S'); 
    });

    if (selectFilesVisibleButton && fileInput) {
        selectFilesVisibleButton.addEventListener('click', () => {
            fileInput.click();
        });
    } else {
        console.error('initUpload: Elementos de upload (botão visível ou input oculto) não encontrados ou inválidos. O upload não funcionará.');
    }

    fileInput.addEventListener('change', (e) => {
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

    function createFileList(files) {
        const dataTransfer = new DataTransfer();
        files.forEach(file => dataTransfer.items.add(file));
        return dataTransfer.files;
    }

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

        // Limpa camadas e estado
        state.layers.lotes.clearLayers();
        state.layers.app.clearLayers();
        state.layers.poligonais.clearLayers();
        state.allLotes = [];
        state.nucleusSet.clear();
        
        let allProcessedFeatures = {
            lotes: [],
            app: [],
            risco: [],
            poligonais: []
        };

        for (const file of filesToProcess) {
            try {
                const reader = new FileReader();
                const fileContent = await new Promise((resolve, reject) => {
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = (e) => reject(e);
                    reader.readAsText(file);
                });
                let geojsonData = JSON.parse(fileContent);

                if (state.utmOptions.useUtm) {
                    geojsonData = reprojectGeoJSONFromUTM(geojsonData, state.utmOptions.zone, state.utmOptions.south);
                }

                const fileNameLower = file.name.toLowerCase();
                // **LÓGICA DE CATEGORIZAÇÃO SEPARADA**
                if (fileNameLower.includes('lote') && !fileNameLower.includes('risco')) {
                    allProcessedFeatures.lotes.push(...geojsonData.features);
                } else if (fileNameLower.includes('app')) {
                    allProcessedFeatures.app.push(...geojsonData.features);
                } else if (fileNameLower.includes('risco')) {
                    // Adiciona lotes de risco à camada principal de lotes para análise,
                    // mas podemos estilizá-los de forma diferente se necessário.
                    allProcessedFeatures.lotes.push(...geojsonData.features);
                } else {
                    allProcessedFeatures.poligonais.push(...geojsonData.features);
                }
            } catch (error) {
                uploadStatus.textContent = `Erro ao processar ${file.name}: ${error.message}`;
                uploadStatus.className = 'status-message error';
                return;
            }
        }

        // Processa todos os lotes coletados (normais + de risco)
        state.allLotes = allProcessedFeatures.lotes;
        state.allLotes.forEach(f => {
            if (f.properties && f.properties.desc_nucleo) {
                state.nucleusSet.add(f.properties.desc_nucleo);
            }
        });

        // Adiciona cada categoria de feição à sua camada correspondente no mapa
        L.geoJSON(allProcessedFeatures.lotes, { onEachFeature: onEachLoteFeature, style: styleLote }).addTo(state.layers.lotes);
        L.geoJSON(allProcessedFeatures.app, { onEachFeature: onEachAppFeature, style: styleApp }).addTo(state.layers.app);
        L.geoJSON(allProcessedFeatures.poligonais, { onEachFeature: onEachPoligonalFeature, style: stylePoligonal }).addTo(state.layers.poligonais);
        
        // Ajusta o zoom do mapa para todas as camadas carregadas
        const allLayersGroup = L.featureGroup([state.layers.lotes, state.layers.app, state.layers.poligonais]);
        if (allLayersGroup.getLayers().length > 0) {
            try { 
                state.map.fitBounds(allLayersGroup.getBounds(), { padding: [20, 20] }); 
            } catch (e) {
                console.warn("Não foi possível ajustar o mapa aos bounds.", e);
            }
        }

        // Atualiza a interface
        populateNucleusFilter();
        refreshDashboard();
        fillLotesTable();

        uploadStatus.textContent = 'Dados carregados e processados com sucesso!';
        uploadStatus.className = 'status-message success';
    });
}
// ===================== Estilos e Popups das Camadas Geoespaciais =====================

// Estilo dos lotes baseado no risco
function styleLote(feature) {
    const risco = String(feature.properties.risco || feature.properties.status_risco || 'N/A').toLowerCase(); 
    let color;
    if (risco.includes('baixo') || risco === '1') color = '#2ecc71';      
    else if (risco.includes('médio') || risco.includes('medio') || risco === '2') color = '#f39c12'; 
    else if (risco.includes('alto') && !risco.includes('muito') || risco === '3') color = '#e74c3c'; 
    else if (risco.includes('muito alto') || risco === '4') color = '#c0392b'; 
    else color = '#3498db'; 

    return {
        fillColor: color,
        weight: 1,
        opacity: 1,
        color: 'white', 
        dashArray: '3', 
        fillOpacity: 0.7
    };
}

// Popup ao clicar no lote
function onEachLoteFeature(feature, layer) {
    if (feature.properties) {
        let popupContent = "<h3>Detalhes do Lote:</h3>";
        for (let key in feature.properties) {
            let value = feature.properties[key];
            if (value === null || value === undefined || value === '') value = 'N/A'; 

            // Formatação de valores específicos conforme as suas tabelas
            if (key.toLowerCase() === 'area_m2' && typeof value === 'number') { 
                value = value.toLocaleString('pt-BR') + ' m²';
            }
            if (key.toLowerCase() === 'valor' && typeof value === 'number') { 
                value = 'R$ ' + value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
            if (key.toLowerCase() === 'dentro_app' && typeof value === 'number') { 
                value = (value > 0) ? `Sim (${value}%)` : 'Não'; 
            }
            // Mapeamento de nomes de propriedades para exibição no popup (adaptado para suas tabelas)
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
            }

            popupContent += `<strong>${displayKey}:</strong> ${value}<br>`;
        }
        layer.bindPopup(popupContent);
    }
}

// Estilo da camada APP
function styleApp(feature) {
    return {
        color: '#e74c3c', // Vermelho para APP
        weight: 2,
        opacity: 0.7,
        fillOpacity: 0.2
    };
}

// Popup da camada APP
function onEachAppFeature(feature, layer) {
    if (feature.properties) {
        let popupContent = "<h3>Área de Preservação Permanente (APP)</h3>";
        for (let key in feature.properties) {
            popupContent += `<strong>${key}:</strong> ${feature.properties[key]}<br>`;
        }
        layer.bindPopup(popupContent);
    }
}

// Estilo da camada Poligonal (para tabela_geral e outros)
function stylePoligonal(feature) {
    return {
        color: '#2ecc71', // Verde para poligonais
        weight: 2,
        opacity: 0.7,
        fillOpacity: 0.2
    };
}

// Popup da camada Poligonal (para tabela_geral e outros)
async function onEachPoligonalFeature(feature, layer) {
    if (feature.properties) {
        const props = feature.properties;
        const municipioNome = props.municipio || props.nm_mun || 'Não informado'; 

        let popupContent = `<h3>Informações da Poligonal: ${municipioNome}</h3>`;
        popupContent += `<strong>Município:</strong> ${municipioNome}<br>`;
        if (props.area_m2) popupContent += `<strong>Área (m²):</strong> ${props.area_m2.toLocaleString('pt-BR')} m²<br>`;
        for (let key in props) {
            if (!['municipio', 'nm_mun', 'area_m2'].includes(key.toLowerCase())) {
                popupContent += `<strong>${key}:</strong> ${props[key]}<br>`;
            }
        }
        
        popupContent += `<button onclick="buscarInfoCidade('${municipioNome}')" style="margin-top:8px;">Ver informações do município</button>`;
        
        layer.bindPopup(popupContent);
    }
}

// ===================== Função simulada para buscar dados extras de cidade =====================
async function buscarInfoCidade(nomeCidade) {
    alert(`Buscando dados simulados para ${nomeCidade}...`);
    const dadosSimulados = getSimulatedMunicipioData(nomeCidade); 
    
    let info = `**Informações para ${dadosSimulados.municipio}:**\n`;
    info += `- Região: ${dadosSimulados.regiao}\n`;
    info += `- População Estimada: ${dadosSimulados.populacao}\n`;
    info += `- Área Territorial: ${dadosSimulados.area_km2} km²\n\n`;
    info += `(Estes dados são simulados para demonstração client-side. Para dados reais, um backend seria necessário.)`;

    alert(info);
    console.log("Dados do município simulados:", dadosSimulados);
}


// ===================== Filtros por Núcleo =====================
function populateNucleusFilter() {
    console.log('populateNucleusFilter: Preenchendo filtro de núcleos com:', Array.from(state.nucleusSet)); 
    const filterSelect = document.getElementById('nucleusFilter');
    const reportNucleosSelect = document.getElementById('nucleosAnalise');
    
    // Limpa os selects
    filterSelect.innerHTML = '<option value="all">Todos os Núcleos</option>';
    reportNucleosSelect.innerHTML = '<option value="all">Todos os Núcleos</option>';
    
    if (state.nucleusSet.size > 0) {
        const sortedNucleos = Array.from(state.nucleusSet).sort();
        sortedNucleos.forEach(nucleo => {
            if (nucleo && nucleo.trim() !== '') { 
                const option1 = document.createElement('option');
                option1.value = nucleo;
                option1.textContent = nucleo;
                filterSelect.appendChild(option1);

                const option2 = document.createElement('option');
                option2.value = nucleo;
                option2.textContent = nucleo;
                reportNucleosSelect.appendChild(option2);
            }
        });
    } else {
        reportNucleosSelect.innerHTML = '<option value="none" disabled selected>Nenhum núcleo disponível.</option>';
    }
}
/** Filtra os lotes com base no núcleo selecionado. */
function filteredLotes() {
    if (state.currentNucleusFilter === 'all') {
        return state.allLotes;
    }
    return state.allLotes.filter(f => {
        const nuc = (f.properties?.desc_nucleo || f.properties?.nucleo || '');
        return nuc === state.currentNucleusFilter;
    });
}

/** Aplica zoom ao mapa para a extensão dos lotes filtrados. */
function zoomToFilter() {
    const feats = filteredLotes();
    if (feats.length === 0) {
        state.map.setView([-15.7801, -47.9292], 5); // Centraliza no Brasil
        return;
    }
    const layer = L.geoJSON({ type: 'FeatureCollection', features: feats });
    try { 
        state.map.fitBounds(layer.getBounds(), { padding: [20, 20] }); 
    } catch (e) {
        console.warn("Não foi possível ajustar o mapa ao filtro. Verifique as coordenadas dos lotes filtrados.", e);
    }
}

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
        // Pega o valor de risco de múltiplas colunas possíveis e converte para string e minúsculas
        const risco = String(p.risco || p.status_risco || p.grau || 'N/A').toLowerCase();

        // **NOVA LÓGICA DE CONTAGEM DE RISCO**
        // Primeiro, verifica se o risco é "geologico" ou "hidrologico" e os trata como risco ALTO por padrão
        if (risco === 'geologico' || risco === 'hidrologico') {
            riskCounts['Alto']++; // Classifica como Risco Alto
        } 
        // Se não for, verifica os outros valores
        else if (risco === '1' || risco.includes('baixo')) {
            riskCounts['Baixo']++;
        } else if (risco === '2' || risco.includes('médio') || risco.includes('medio')) {
            riskCounts['Médio']++;
        } else if (risco === '3' || risco.includes('alto')) {
            riskCounts['Alto']++;
        } else if (risco === '4' || risco.includes('muito alto')) {
            riskCounts['Muito Alto']++;
        } else if (risco !== 'n/a' && risco !== 'null' && risco.trim() !== '') {
            // Apenas mostra o aviso se o risco não for N/A, null ou vazio
            console.warn(`Risco não mapeado encontrado: "${risco}" para lote`, p);
        }
        
        // Contagem para o card "Lotes em Risco" (Médio + Alto + Muito Alto)
        // Inclui "geologico" e "hidrologico" como risco, e também médio
        if (risco === '2' || risco === '3' || risco === '4' || risco.includes('médio') || risco.includes('medio') || risco.includes('alto') || risco === 'geologico' || risco === 'hidrologico') {
            lotesRiscoAltoMuitoAlto++;
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
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="7">Nenhum dado disponível. Faça o upload das camadas primeiro ou ajuste os filtros.</td>';
        tbody.appendChild(tr);
        return;
    }

    const fragment = document.createDocumentFragment();
    feats.forEach((f, idx) => {
        const p = f.properties || {};
        const tr = document.createElement('tr');

        const codLote = p.cod_lote || p.codigo || `Lote ${idx + 1}`; 
        const descNucleo = p.desc_nucleo || p.nucleo || 'N/A';
        const tipoUso = p.tipo_uso || 'N/A';
        const areaM2 = (p.area_m2 && typeof p.area_m2 === 'number') ? p.area_m2.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : 'N/A';
        const statusRisco = p.risco || p.status_risco || 'N/A'; 
        const emApp = (typeof p.dentro_app === 'number' && p.dentro_app > 0) ? 'Sim' : 'Não'; 
        
        const btnHtml = `<button class="zoomLoteBtn small-btn" data-codlote="${codLote}">Ver no Mapa</button>`;
        tr.innerHTML = `
            <td>${codLote}</td>
            <td>${descNucleo}</td>
            <td>${tipoUso}</td>
            <td>${areaM2}</td>
            <td>${statusRisco}</td>
            <td>${emApp}</td>
            <td>${btnHtml}</td>
        `;
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);

    // **CORREÇÃO AQUI**: Adiciona listeners para os botões "Ver no Mapa"
    tbody.querySelectorAll('.zoomLoteBtn').forEach(btn => {
        btn.addEventListener('click', () => {
            const codLoteToZoom = btn.getAttribute('data-codlote');
            const loteToZoom = state.allLotes.find(l => (l.properties?.cod_lote == codLoteToZoom)); // '==' para comparar string com número se necessário
            
            if (loteToZoom) {
                document.querySelector('nav a[data-section="dashboard"]').click();
                const tempLayer = L.geoJSON(loteToZoom); 
                try { 
                    state.map.fitBounds(tempLayer.getBounds(), { padding: [50, 50] }); 
                } catch (e) {
                    console.warn("Não foi possível ajustar o mapa ao lote selecionado. Verifique as coordenadas do lote.", e);
                }
                state.layers.lotes.eachLayer(layer => {
                    if (layer.feature?.properties?.cod_lote == codLoteToZoom && layer.openPopup) { // '==' para comparar string com número
                        layer.openPopup();
                    }
                });
            } else {
                console.warn(`Lote com código ${codLoteToZoom} não encontrado na lista para zoom.`);
            }
        });
    });

    // Funcionalidade de busca na tabela
    const searchInput = document.getElementById('lotSearch');
    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase();
        Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
            const textContent = tr.textContent.toLowerCase();
            tr.style.display = textContent.includes(searchTerm) ? '' : 'none';
        });
    });

    // Funcionalidade de exportar CSV da tabela
    document.getElementById('exportTableBtn').onclick = () => {
        const rows = [['Código','Núcleo','Tipo de Uso','Área (m²)','Status Risco','APP']];
        Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
            if (tr.style.display === 'none') return; 
            const tds = tr.querySelectorAll('td');
            if (tds.length >= 6) rows.push([
                tds[0].textContent, tds[1].textContent, tds[2].textContent,
                tds[3].textContent, tds[4].textContent, tds[5].textContent
            ]);
        });
        const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(';')).join('\n');
        downloadText('lotes_tabela.csv', csv);
    };
}


// ===================== Legenda / Toggle Camadas =====================
function initLegendToggles() {
    const toggle = (id, layer) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => {
            if (el.checked) layer.addTo(state.map); else state.map.removeLayer(layer);
        });
    };
    toggle('toggleLotes', state.layers.lotes);
    toggle('togglePoligonais', state.layers.poligonais);
    toggle('toggleAPP', state.layers.app);
}

// ===================== Formulário de Informações Gerais (Manual) =====================
function initGeneralInfoForm() {
    const saveButton = document.getElementById('saveGeneralInfoBtn');
    const statusMessage = document.getElementById('generalInfoStatus');

    saveButton.addEventListener('click', () => {
        const getRadioValue = (name) => {
            const radios = document.getElementsByName(name);
            for (let i = 0; i < radios.length; i++) {
                if (radios[i].checked) {
                    return radios[i].value;
                }
            }
            return ''; 
        };

        state.generalProjectInfo = {
            ucConservacao: getRadioValue('ucConservacao'),
            protecaoMananciais: getRadioValue('protecaoMananciais'),
            tipoAbastecimento: document.getElementById('tipoAbastecimento').value.trim(),
            responsavelAbastecimento: document.getElementById('responsavelAbastecimento').value.trim(),
            tipoColetaEsgoto: document.getElementById('tipoColetaEsgoto').value.trim(),
            responsavelColetaEsgoto: document.getElementById('responsavelColetaEsgoto').value.trim(),
            sistemaDrenagem: getRadioValue('sistemaDrenagem'),
            drenagemInadequada: getRadioValue('drenagemInadequada'),
            logradourosIdentificados: getRadioValue('logradourosIdentificados'),
            
            linhaTransmissao: getRadioValue('linhaTransmissao'),
            minerodutoGasoduto: getRadioValue('minerodutoGasoduto'),
            linhaFerrea: getRadioValue('linhaFerrea'),
            aeroporto: getRadioValue('aeroporto'),
            limitacoesOutras: getRadioValue('limitacoesOutras'),
            processoMP: getRadioValue('processoMP'),
            processosJudiciais: getRadioValue('processosJudiciais'),
            comarcasCRI: document.getElementById('comarcasCRI').value.trim(),
            
            titularidadeArea: getRadioValue('titularidadeArea'),
            terraLegal: getRadioValue('terraLegal'),
            instrumentoJuridico: document.getElementById('instrumentoJuridico').value.trim(),
            legislacaoReurb: document.getElementById('legislacaoReurb').value.trim(),
            legislacaoAmbiental: getRadioValue('legislacaoAmbiental'),
            planoDiretor: getRadioValue('planoDiretor'),
            zoneamento: getRadioValue('zoneamento'),
            municipioOriginal: document.getElementById('municipioOriginal').value.trim(),
            matriculasOrigem: document.getElementById('matriculasOrigem').value.trim(),
            matriculasIdentificadas: document.getElementById('matriculasIdentificadas').value.trim(),

            adequacaoDesconformidades: getRadioValue('adequacaoDesconformidades'),
            obrasInfraestrutura: getRadioValue('obrasInfraestrutura'),
            medidasCompensatorias: getRadioValue('medidasCompensatorias')
        };

        statusMessage.textContent = 'Informações gerais salvas com sucesso (localmente)!';
        statusMessage.className = 'status-message success';
        console.log('Informações Gerais Salvas:', state.generalProjectInfo); 
    });
}


// ===================== Geração de Relatório =====================
async function gerarRelatorio() {
    console.log('Gerando Relatório...');
    const nucleoAnalisado = document.getElementById('nucleosAnalise').value;
    const dataPreenchimento = document.getElementById('dataPreenchimento').value;
    const dataRevisao = document.getElementById('dataRevisao').value;

    const reportPlaceholder = document.getElementById('reportPlaceholder');
    const reportDataContainer = document.getElementById('reportData');
    const reportTextOutput = document.getElementById('reportTextOutput');

    if (state.allLotes.length === 0) {
        reportPlaceholder.textContent = "Nenhum dado de lote disponível para gerar o relatório. Faça o upload das camadas primeiro.";
        reportDataContainer.style.display = 'none';
        reportPlaceholder.style.display = 'flex';
        return;
    }
    if (nucleoAnalisado === 'none') {
        reportPlaceholder.textContent = "Por favor, selecione um núcleo para análise.";
        reportDataContainer.style.display = 'none';
        reportPlaceholder.style.display = 'flex';
        return;
    }

    // Filtra os lotes para o núcleo selecionado
    const lotesDoNucleo = state.allLotes.filter(f => f.properties.desc_nucleo === nucleoAnalisado);
    if (lotesDoNucleo.length === 0) {
        reportPlaceholder.textContent = `Nenhum lote encontrado para o núcleo "${nucleoAnalisado}".`;
        reportDataContainer.style.display = 'none';
        reportPlaceholder.style.display = 'flex';
        return;
    }

    // --- Início dos Cálculos para o Relatório ---

    // Informações básicas do primeiro lote (assumindo consistência)
    const primeiroLoteProps = lotesDoNucleo[0].properties;
    const municipio = primeiroLoteProps.municipio || primeiroLoteProps.nm_mun || 'Não informado';
    const uf = primeiroLoteProps.uf || 'Não informado';

    // Total de lotes e área
    const totalLotes = lotesDoNucleo.length;
    const areaPoligonal = lotesDoNucleo.reduce((acc, f) => acc + (f.properties.area_m2 || 0), 0);
    
    // Contagem de lotes edificados e vagos
    const lotesEdificados = lotesDoNucleo.filter(f => f.properties.tipo_edificacao && f.properties.tipo_edificacao.toLowerCase() !== 'sem edificação').length;
    const lotesVagos = totalLotes - lotesEdificados;
    const percVagos = totalLotes > 0 ? (lotesVagos / totalLotes * 100).toFixed(1) : 0;
    
    // Contagem por tipologia construtiva
    const tipologiasConstrutivas = lotesDoNucleo.reduce((acc, f) => {
        const tipo = f.properties.tipo_edificacao || 'Não informado';
        acc[tipo] = (acc[tipo] || 0) + 1;
        return acc;
    }, {});
    
    // Contagem por tipologia de uso
    const tipologiasUso = lotesDoNucleo.reduce((acc, f) => {
        const tipo = f.properties.tipo_uso || 'Não informado';
        acc[tipo] = (acc[tipo] || 0) + 1;
        return acc;
    }, {});

    // Lotes sem número postal
    const lotesSemNumero = lotesDoNucleo.filter(f => !f.properties.numero_postal).length;

    // Análise de APP
    const lotesEmApp = lotesDoNucleo.filter(f => (f.properties.dentro_app || 0) > 0);
    const totalLotesEmApp = lotesEmApp.length;
    const areaTotalSobreposicaoApp = lotesEmApp.reduce((acc, f) => acc + (f.properties.area_app || 0), 0);
    const lotesTotalmenteEmApp = lotesEmApp.filter(f => (f.properties.dentro_app || 0) >= 100).length;

    // Análise de Risco
    let riskCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    let custoTotalRisco = 0;
    const lotesEmRisco = lotesDoNucleo.filter(f => f.properties.risco || f.properties.grau);
    const areasDeRisco = lotesEmRisco.reduce((acc, f) => {
        const p = f.properties;
        const idArea = p.id_respondente || p.cod_area; // Assumindo que cada linha na tabela de risco é uma "área"
        if (idArea && !acc[idArea]) {
            acc[idArea] = {
                grau: p.grau || 'N/D',
                tipoRisco: p.risco || 'N/D',
                qtdeLotes: (acc[idArea]?.qtdeLotes || 0) + 1, // Contagem simples por enquanto
                intervencao: p.intervencao || 'N/D',
                valor: (acc[idArea]?.valor || 0) + (p.valor || 0)
            };
        }
        return acc;
    }, {});
    
    lotesEmRisco.forEach(f => {
        const grau = Number(f.properties.grau);
        if (grau >= 1 && grau <= 4) riskCounts[grau]++;
        custoTotalRisco += (f.properties.valor || 0);
    });

    const totalLotesUnicosEmRisco = Object.values(riskCounts).reduce((a, b) => a + b, 0);
    const percLotesEmRisco = totalLotes > 0 ? (totalLotesUnicosEmRisco / totalLotes * 100).toFixed(1) : 0;
    
    // --- Início da Montagem do Texto do Relatório ---

    let reportText = `RELATÓRIO DO NÚCLEO: ${nucleoAnalisado}\n`;
    reportText += "=".repeat(67) + "\n";
    reportText += `  Núcleo: ${nucleoAnalisado}\n`;
    reportText += `  Município/UF: ${municipio}/${uf}\n`;
    // Microrregião e Mesorregião precisariam vir dos dados ou de uma API
    reportText += `  Data de Preenchimento: ${dataPreenchimento || new Date().toLocaleDateString('pt-BR')}\n`;
    reportText += `  Data de Revisão: ${dataRevisao || 'N/A'}\n`;
    reportText += `  Número Total de Unidades/Lotes: ${totalLotes}\n`;
    reportText += `  Área da Poligonal: ${areaPoligonal.toLocaleString('pt-BR', {maximumFractionDigits: 2})} m²\n`;
    reportText += `  Lotes Edificados: ${lotesEdificados}\n`;
    reportText += `  Lotes Não Edificados (Vagos): ${lotesVagos}\n`;
    reportText += `  % de Lotes Vagos: ${percVagos}%\n`;

    reportText += `  Tipologias Construtivas Predominantes:\n`;
    for (const [tipo, count] of Object.entries(tipologiasConstrutivas)) {
        const perc = ((count / totalLotes) * 100).toFixed(1);
        reportText += `    ${tipo}: ${count} (${perc}%)\n`;
    }

    reportText += `  Tipologias de Uso Predominantes:\n`;
    for (const [tipo, count] of Object.entries(tipologiasUso)) {
        const perc = ((count / totalLotes) * 100).toFixed(1);
        reportText += `    ${tipo}: ${count} (${perc}%)\n`;
    }

    reportText += `  Lotes Sem Número Postal: ${lotesSemNumero}\n`;
    reportText += `  Identificação de Números Postais: ${lotesSemNumero < totalLotes ? 'SIM' : 'NÃO'}\n`;
    reportText += `  Presença de APP no Núcleo: ${totalLotesEmApp > 0 ? 'SIM' : 'NÃO'}\n`;
    reportText += `  Total de Lotes do Núcleo em APP: ${totalLotesEmApp}\n`;
    reportText += `  Área Total de Sobreposição com APP: ${areaTotalSobreposicaoApp.toLocaleString('pt-BR', {maximumFractionDigits: 2})} m²\n`;
    reportText += `  Lotes do Núcleo Totalmente Dentro da APP: ${lotesTotalmenteEmApp}\n`;
    // Outras interseções (faixa de domínio, etc.) precisariam de mais camadas
    reportText += `  Interseção com Faixa de Domínio de Rodovia: [CAMADA NÃO ENCONTRADA]\n`;

    reportText += `\n--- RESUMO DAS ÁREAS DE RISCO ---\n`;
    reportText += `  ID Área    | Grau | Tipo Risco      | Lotes Qtde | Intervenção (Início)                     |      Valor (R$)\n`;
    reportText += "  " + "-".repeat(110) + "\n";
    for (const [id, area] of Object.entries(areasDeRisco)) {
        const intervencaoCurta = area.intervencao.substring(0, 40);
        const valorFormatado = area.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        reportText += `  ${String(id).padEnd(10)} | ${String(area.grau).padEnd(4)} | ${String(area.tipoRisco).padEnd(15)} | ${String(area.qtdeLotes).padEnd(10)} | ${intervencaoCurta.padEnd(40)} | ${valorFormatado.padStart(15)}\n`;
    }
    reportText += "  " + "-".repeat(110) + "\n";
    reportText += `  CUSTO TOTAL DAS INTERVENÇÕES: ${formatBRL(custoTotalRisco)}\n`;
    
    reportText += `\n--- TOTAIS E CLASSIFICAÇÕES DE RISCO (Resumo) ---\n`;
    reportText += `  Presença de Áreas de Risco (SIM/NÃO): ${totalLotesUnicosEmRisco > 0 ? 'SIM' : 'NÃO'}\n`;
    reportText += `  Número de Áreas de Risco Identificadas: ${Object.keys(areasDeRisco).length}\n`;
    reportText += `  Total de Lotes Únicos do Núcleo em Risco: ${totalLotesUnicosEmRisco}\n`;
    reportText += `  Lotes em Risco Grau 1: ${riskCounts[1]}\n`;
    reportText += `  Lotes em Risco Grau 2: ${riskCounts[2]}\n`;
    reportText += `  Lotes em Risco Grau 3: ${riskCounts[3]}\n`;
    reportText += `  Lotes em Risco Grau 4: ${riskCounts[4]}\n`;
    reportText += `  % de Lotes do Núcleo em Risco: ${percLotesEmRisco}%\n`;
    reportText += `  Áreas que Demandam Intervenção Estrutural: ${Object.keys(areasDeRisco).length}\n`;

    reportText += `\n--- DEMAIS INFORMAÇÕES (TABELA GERAL) ---\n`;
    // Puxa das informações manuais salvas no estado
    for (const [key, value] of Object.entries(state.generalProjectInfo)) {
        reportText += `  ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${value || 'Não informado'}\n`;
    }

    reportText += "=".repeat(67) + "\n";

    // Exibe o relatório
    reportTextOutput.textContent = reportText;
    state.lastReportText = reportText; // Salva para exportação
    reportPlaceholder.style.display = 'none';
    reportDataContainer.style.display = 'block';
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

    // Configura listeners para os botões principais (Aplicar Filtros, Gerar Relatório, Exportar Relatório)
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
    
    // Configura listener para a mudança no select de filtros (para aplicar o zoom também)
    document.getElementById('nucleusFilter').addEventListener('change', () => {
        state.currentNucleusFilter = document.getElementById('nucleusFilter').value;
        refreshDashboard();
        fillLotesTable();
        zoomToFilter(); // Zoom quando o filtro muda no Dashboard
    });


    // Estado inicial: Dashboard ativo e preenchido (vazio no início)
    document.getElementById('dashboard').classList.add('active');
    document.querySelector('nav a[data-section="dashboard"]').classList.add('active');
    refreshDashboard(); 
    fillLotesTable(); 
    populateNucleusFilter(); 
    console.log('DOMContentLoaded: Configurações iniciais do app aplicadas.'); 
});
