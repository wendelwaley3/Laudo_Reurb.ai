// ===================== Filtros por Núcleo =====================
function populateNucleusFilter() {
    console.log('populateNucleusFilter: Preenchendo filtro de núcleos com:', Array.from(state.nucleusSet)); 
    const filterSelect = document.getElementById('nucleusFilter');
   const reportNucleosSelect = document.getElementById('nucleosAnalise');
if (!reportNucleosSelect) {
    console.error("Elemento 'nucleosAnalise' não encontrado no HTML!");
}
    
    filterSelect.innerHTML = '<option value="all">Todos os Núcleos</option>';
   if (reportNucleosSelect) {
   if (reportNucleosSelect) {
    reportNucleosSelect.innerHTML = '<option value="all">Todos os Núcleos</option>';
}
}
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

function filteredLotes() {
    if (state.currentNucleusFilter === 'all') return state.allLotes;
    return state.allLotes.filter(f => f.properties?.desc_nucleo === state.currentNucleusFilter);
}

function zoomToFilter() {
    const feats = filteredLotes();
    if (feats.length === 0) {
        state.map.setView([-15.7801, -47.9292], 5); 
        return;
    }
    const layer = L.geoJSON({ type: 'FeatureCollection', features: feats });
    try { state.map.fitBounds(layer.getBounds(), { padding: [20,20] }); } catch (e) {
        console.warn("Não foi possível ajustar o mapa ao filtro.", e);
    }
}
