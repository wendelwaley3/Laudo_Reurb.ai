// ===================== Gerenciamento de Upload e Processamento de GeoJSON =====================
function initUpload() {
    console.log('initUpload: Configurando upload de arquivos...'); 
    const fileInput = document.getElementById('geojsonFileInput');
    const dragDropArea = document.querySelector('.drag-drop-area'); // A div que é a área de drop
    const fileListElement = document.getElementById('fileList');
    const processAndLoadBtn = document.getElementById('processAndLoadBtn');
    const uploadStatus = document.getElementById('uploadStatus');

    // **CORREÇÃO AQUI**: Seleciona o botão visível PELO SEU ID
    const selectFilesVisibleButton = document.getElementById('selectFilesVisibleButton');

    // **CORREÇÃO AQUI**: Adiciona um listener de clique ao botão visível para disparar o clique no input de arquivo oculto
    if (selectFilesVisibleButton && fileInput) {
        selectFilesVisibleButton.addEventListener('click', () => {
            console.log('Evento: Botão "Selecionar Arquivos" (visível) clicado. Disparando clique no input oculto...'); 
            fileInput.click(); // Isso abre o diálogo de seleção de arquivos do navegador
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
            fileListElement.innerHTML = ''; // Limpa a lista antes de adicionar novos
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
        fileInput.files = createFileList(droppedFiles); // Usa a função auxiliar
        fileInput.dispatchEvent(new Event('change')); // Dispara o evento change para atualizar a lista
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

        const newLotesFeatures = []; // Coleta todos os lotes de todos os arquivos 'lotes'
        const newAPPFeatures = [];   // Coleta todas as APPs de todos os arquivos 'app'
        const newPoligonaisFeatures = []; // Coleta todas as poligonais de outros arquivos

        for (const file of filesToProcess) {
            try {
                console.log(`Processando arquivo: ${file.name}`); 
                const reader = new FileReader();
                const fileContent = await new Promise((resolve, reject) => {
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = (e) => reject(e);
                    reader.readAsText(file);
                });
                let geojsonData = JSON.parse(fileContent);

                // --- Reprojeção UTM, se ativada ---
                if (state.utmOptions.useUtm) {
                    console.log(`Tentando reprojetar ${file.name} de UTM para WGS84 (Zona ${state.utmOptions.zone}, Hemisfério ${state.utmOptions.south ? 'Sul' : 'Norte'})...`);
                    try {
                        geojsonData = reprojectGeoJSONFromUTM(geojsonData, state.utmOptions.zone, state.utmOptions.south);
                        console.log(`Reprojeção de ${file.name} concluída.`);
                    } catch (e) {
                        console.error(`Falha na reprojeção de ${file.name}:`, e);
                        uploadStatus.textContent = `Erro: Falha na reprojeção UTM de ${file.name}. Verifique a zona/hemisfério ou converta o arquivo previamente.`;
                        uploadStatus.className = 'status-message error';
                        return; 
                    }
                }
                // --- Fim da Reprojeção UTM ---

                // Validação básica do GeoJSON
                if (!geojsonData.type || !geojsonData.features) {
                     throw new Error('Arquivo GeoJSON inválido: missing "type" or "features" property.');
                }
                if (geojsonData.type !== 'FeatureCollection') {
                     console.warn(`Arquivo ${file.name} não é um FeatureCollection, pode não ser processado corretamente.`);
                }

                // Lógica para categorizar camadas por nome do arquivo
                const fileNameLower = file.name.toLowerCase();
                if (fileNameLower.includes('lote')) { 
                    newLotesFeatures.push(...geojsonData.features);
                } else if (fileNameLower.includes('app')) { 
                    newAPPFeatures.push(...geojsonData.features);
                } else { 
                    newPoligonaisFeatures.push(...geojsonData.features);
                }
                console.log(`Arquivo ${file.name} categorizado.`); 

            } catch (error) {
                console.error(`Erro ao carregar ou parsear ${file.name}:`, error); 
                uploadStatus.textContent = `Erro ao processar ${file.name}. Verifique o formato GeoJSON ou se é válido. Detalhes: ${error.message}`;
                uploadStatus.className = 'status-message error';
                state.layers.lotes.clearLayers();
                state.layers.app.clearLayers();
                state.layers.poligonais.clearLayers();
                state.allLotes = [];
                state.nucleusSet.clear();
                return; 
            }
        }

        // Processa lotes e extrai núcleos
        state.allLotes = newLotesFeatures; 
        newLotesFeatures.forEach(f => {
            if (f.properties && f.properties.desc_nucleo) { 
                state.nucleusSet.add(f.properties.desc_nucleo);
            }
        });
        
        // Adiciona as feições aos FeatureGroups do Leaflet para exibição no mapa
        L.geoJSON(newAPPFeatures, { onEachFeature: onEachAppFeature, style: styleApp }).addTo(state.layers.app);
        L.geoJSON(newPoligonaisFeatures, { onEachFeature: onEachPoligonalFeature, style: stylePoligonal }).addTo(state.layers.poligonais);
        L.geoJSON(state.allLotes, { onEachFeature: onEachLoteFeature, style: styleLote }).addTo(state.layers.lotes);

        // Ajusta o mapa para a extensão de todos os dados carregados
        const allLayersGroup = L.featureGroup([state.layers.lotes, state.layers.app, state.layers.poligonais]);
        if (allLayersGroup.getLayers().length > 0) {
            try { 
                state.map.fitBounds(allLayersGroup.getBounds(), { padding: [20, 20] }); 
                console.log('Mapa ajustado para os bounds dos dados carregados.');
            } catch (e) {
                console.warn("Não foi possível ajustar o mapa aos bounds. Verifique as coordenadas dos seus GeoJSONs.", e);
            }
        } else {
            state.map.setView([-15.7801, -47.9292], 5); // Centraliza no Brasil se não houver dados
            console.log('Nenhum dado carregado, mapa centralizado no Brasil.');
        }

        // Atualiza UI
        populateNucleusFilter();
        refreshDashboard();
        fillLotesTable(); 

        uploadStatus.textContent = 'Dados carregados e processados com sucesso! Vá para o Dashboard ou Dados Lotes.';
        uploadStatus.className = 'status-message success';
        console.log('Todos os arquivos processados e dados carregados no mapa e dashboard.'); 
    });
}
