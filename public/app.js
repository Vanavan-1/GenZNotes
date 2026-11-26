(() => {
  const state = {
    notes: [],
    currentNote: null,
    currentReadme: '',
    editingId: null,
    links: [],
    images: [], // { filename?, dataUrl?, originalName?, caption }
    activeSpeechTarget: null,
    recognition: null,
  };

  // Elements
  const viewLibrary = document.getElementById('viewLibrary');
  const viewEditor = document.getElementById('viewEditor');
  const viewReader = document.getElementById('viewReader');
  const searchWrap = document.getElementById('searchWrap');
  const searchInput = document.getElementById('searchInput');
  const notesGrid = document.getElementById('notesGrid');
  const emptyState = document.getElementById('emptyState');
  const notesCountPill = document.getElementById('notesCountPill');

  const noteForm = document.getElementById('noteForm');
  const editorHeading = document.getElementById('editorHeading');
  const noteTitle = document.getElementById('noteTitle');
  const noteTags = document.getElementById('noteTags');
  const qOverview = document.getElementById('qOverview');
  const qSteps = document.getElementById('qSteps');
  const qDetails = document.getElementById('qDetails');
  const qTakeaways = document.getElementById('qTakeaways');
  const speechLang = document.getElementById('speechLang');
  const speechSupportBadge = document.getElementById('speechSupportBadge');

  const linkLabelInput = document.getElementById('linkLabelInput');
  const linkUrlInput = document.getElementById('linkUrlInput');
  const linksList = document.getElementById('linksList');

  const dropZone = document.getElementById('dropZone');
  const imageInput = document.getElementById('imageInput');
  const imagePreviewGrid = document.getElementById('imagePreviewGrid');

  const readerVisual = document.getElementById('readerVisual');
  const readerRaw = document.getElementById('readerRaw');
  const rawMarkdownCode = document.getElementById('rawMarkdownCode');
  const tabVisual = document.getElementById('tabVisual');
  const tabRaw = document.getElementById('tabRaw');
  const btnDownloadReadme = document.getElementById('btnDownloadReadme');

  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const toastEl = document.getElementById('toast');

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toastEl.classList.add('hidden'), 2800);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function showView(name) {
    stopRecording();
    viewLibrary.classList.toggle('hidden', name !== 'library');
    viewEditor.classList.toggle('hidden', name !== 'editor');
    viewReader.classList.toggle('hidden', name !== 'reader');
    searchWrap.classList.toggle('hidden', name !== 'library');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // --- Speech Recognition (Voice-to-Text) ---
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function initSpeechSupportBadge() {
    if (SpeechRecognition) {
      speechSupportBadge.textContent = 'Voice-to-Text Ready';
      speechSupportBadge.classList.add('ok');
    } else {
      speechSupportBadge.textContent = 'Use Chrome/Edge for Voice';
      speechSupportBadge.classList.add('warn');
    }
  }

  function stopRecording() {
    if (state.recognition) {
      try {
        state.recognition.stop();
      } catch {}
      state.recognition = null;
    }
    document.querySelectorAll('.btn-mic').forEach((btn) => {
      btn.classList.remove('recording');
      btn.querySelector('.mic-label').textContent = 'Speak';
    });
    document.querySelectorAll('.interim-line').forEach((el) => {
      el.textContent = '';
    });
    state.activeSpeechTarget = null;
  }

  function toggleSpeech(targetId, btn) {
    if (!SpeechRecognition) {
      showToast('Voice-to-text requires Chrome, Edge, or a SpeechRecognition-enabled browser.');
      return;
    }

    if (state.activeSpeechTarget === targetId) {
      stopRecording();
      return;
    }

    stopRecording();

    const textarea = document.getElementById(targetId);
    const interimEl = document.getElementById(`interim-${targetId}`);
    const recognition = new SpeechRecognition();
    recognition.lang = speechLang.value || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    state.activeSpeechTarget = targetId;
    state.recognition = recognition;
    btn.classList.add('recording');
    btn.querySelector('.mic-label').textContent = 'Stop';

    recognition.onresult = (event) => {
      let interim = '';
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalChunk += transcript;
        } else {
          interim += transcript;
        }
      }

      if (finalChunk) {
        let cleaned = finalChunk.trim();
        if (targetId === 'qSteps') {
          cleaned = cleaned.replace(/\bnext line\b/gi, '\n').replace(/\bnew line\b/gi, '\n');
        }
        const existing = textarea.value;
        const separator = existing && !existing.endsWith('\n') && !existing.endsWith(' ') ? ' ' : '';
        textarea.value = existing + separator + cleaned;
      }
      interimEl.textContent = interim ? `Listening: "${interim}"` : '';
    };

    recognition.onerror = (event) => {
      if (event.error !== 'aborted') {
        showToast(`Mic error: ${event.error}`);
      }
      stopRecording();
    };

    recognition.onend = () => {
      if (state.activeSpeechTarget === targetId) {
        stopRecording();
      }
    };

    recognition.start();
  }

  document.querySelectorAll('.btn-mic').forEach((btn) => {
    btn.addEventListener('click', () => toggleSpeech(btn.dataset.target, btn));
  });

  // --- API & Library ---
  async function loadNotes(query = '') {
    const res = await fetch(`/api/notes?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    state.notes = data.notes || [];
    renderLibrary();
  }

  function renderLibrary() {
    notesCountPill.textContent = `${state.notes.length} ${state.notes.length === 1 ? 'note' : 'notes'}`;
    if (state.notes.length === 0) {
      notesGrid.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');
    notesGrid.innerHTML = state.notes
      .map((n) => {
        const tagsHtml = (n.tags || [])
          .slice(0, 4)
          .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
          .join('');
        const stepCount = (n.answers?.steps || '')
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean).length;

        return `
          <div class="note-card" data-id="${escapeHtml(n.id)}">
            <div>
              <h3>${escapeHtml(n.title)}</h3>
            </div>
            ${tagsHtml ? `<div class="tag-row">${tagsHtml}</div>` : ''}
            <p>${escapeHtml(n.answers?.overview || 'No overview recorded.')}</p>
            <div class="note-meta">
              <span>${stepCount} steps · ${(n.images || []).length} images · ${(n.links || []).length} links</span>
              <span>${formatDate(n.updatedAt)}</span>
            </div>
          </div>
        `;
      })
      .join('');

    notesGrid.querySelectorAll('.note-card').forEach((card) => {
      card.addEventListener('click', () => openReader(card.dataset.id));
    });
  }

  // --- Editor ---
  function openEditor(note = null) {
    state.editingId = note ? note.id : null;
    editorHeading.textContent = note ? `Edit: ${note.title}` : 'New Learning Note';
    noteTitle.value = note ? note.title : '';
    noteTags.value = note ? (note.tags || []).join(', ') : '';
    qOverview.value = note ? note.answers?.overview || '' : '';
    qSteps.value = note ? note.answers?.steps || '' : '';
    qDetails.value = note ? note.answers?.details || '' : '';
    qTakeaways.value = note ? note.answers?.takeaways || '' : '';

    state.links = note && Array.isArray(note.links) ? note.links.map((l) => ({ ...l })) : [];
    state.images =
      note && Array.isArray(note.images)
        ? note.images.map((img) => ({
            filename: img.filename,
            caption: img.caption || '',
            previewUrl: `/notes/${encodeURIComponent(note.id)}/images/${encodeURIComponent(img.filename)}`,
          }))
        : [];

    renderLinksEditor();
    renderImagesEditor();
    showView('editor');
  }

  function renderLinksEditor() {
    linksList.innerHTML = state.links
      .map(
        (l, idx) => `
      <li>
        <span>
          <strong>${escapeHtml(l.label || 'Reference')}:</strong>
          <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.url)}</a>
        </span>
        <button type="button" class="btn btn-ghost" data-remove-link="${idx}">Remove</button>
      </li>
    `
      )
      .join('');

    linksList.querySelectorAll('[data-remove-link]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.links.splice(Number(btn.dataset.removeLink), 1);
        renderLinksEditor();
      });
    });
  }

  document.getElementById('btnAddLink').addEventListener('click', () => {
    let url = linkUrlInput.value.trim();
    const label = linkLabelInput.value.trim();
    if (!url) {
      showToast('Please enter a website URL.');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    state.links.push({ label: label || url, url });
    linkLabelInput.value = '';
    linkUrlInput.value = '';
    renderLinksEditor();
  });

  function handleFiles(files) {
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        state.images.push({
          dataUrl: reader.result,
          originalName: file.name,
          caption: file.name.replace(/\.[^.]+$/, ''),
          previewUrl: reader.result,
        });
        renderImagesEditor();
      };
      reader.readAsDataURL(file);
    });
  }

  function renderImagesEditor() {
    imagePreviewGrid.innerHTML = state.images
      .map(
        (img, idx) => `
      <div class="img-preview-card">
        <img src="${escapeHtml(img.previewUrl)}" alt="${escapeHtml(img.caption)}" />
        <div class="img-preview-body">
          <input type="text" placeholder="Image caption..." value="${escapeHtml(img.caption)}" data-caption-idx="${idx}" />
          <button type="button" class="btn btn-danger" data-remove-img="${idx}">Remove</button>
        </div>
      </div>
    `
      )
      .join('');

    imagePreviewGrid.querySelectorAll('[data-caption-idx]').forEach((input) => {
      input.addEventListener('input', () => {
        state.images[Number(input.dataset.captionIdx)].caption = input.value;
      });
    });

    imagePreviewGrid.querySelectorAll('[data-remove-img]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.images.splice(Number(btn.dataset.removeImg), 1);
        renderImagesEditor();
      });
    });
  }

  document.getElementById('btnBrowseImages').addEventListener('click', () => imageInput.click());
  imageInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    imageInput.value = '';
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  noteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    stopRecording();

    const payload = {
      title: noteTitle.value.trim(),
      tags: noteTags.value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      answers: {
        overview: qOverview.value.trim(),
        steps: qSteps.value.trim(),
        details: qDetails.value.trim(),
        takeaways: qTakeaways.value.trim(),
      },
      links: state.links,
      images: state.images.map((img) => ({
        filename: img.filename,
        dataUrl: img.dataUrl,
        originalName: img.originalName,
        caption: img.caption,
      })),
    };

    const url = state.editingId ? `/api/notes/${encodeURIComponent(state.editingId)}` : '/api/notes';
    const method = state.editingId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to save note.');
      return;
    }

    showToast('Saved & generated README.md!');
    await loadNotes(searchInput.value.trim());
    openReader(data.note.id);
  });

  // --- Reader ---
  async function openReader(id) {
    const res = await fetch(`/api/notes/${encodeURIComponent(id)}`);
    if (!res.ok) {
      showToast('Could not load note.');
      return;
    }
    const data = await res.json();
    state.currentNote = data.note;
    state.currentReadme = data.readme;

    renderReader();
    setReaderTab('visual');
    showView('reader');
  }

  function setReaderTab(mode) {
    const isVisual = mode === 'visual';
    tabVisual.classList.toggle('active', isVisual);
    tabRaw.classList.toggle('active', !isVisual);
    readerVisual.classList.toggle('hidden', !isVisual);
    readerRaw.classList.toggle('hidden', isVisual);
  }

  function renderReader() {
    const n = state.currentNote;
    if (!n) return;

    btnDownloadReadme.href = `/api/notes/${encodeURIComponent(n.id)}/readme`;
    rawMarkdownCode.textContent = state.currentReadme;

    const tagsHtml = (n.tags || [])
      .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
      .join('');

    const stepLines = (n.answers?.steps || '')
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/^(\d+[\.\)]\s*|[-*•]\s*)/, ''))
      .filter(Boolean);

    const stepsHtml = stepLines.length
      ? `<ol class="ordered-steps">${stepLines
          .map(
            (step, idx) => `
          <li>
            <span class="step-badge">${idx + 1}</span>
            <span>${escapeHtml(step)}</span>
          </li>`
          )
          .join('')}</ol>`
      : '<p class="subtitle">No ordered steps recorded.</p>';

    const linksHtml = (n.links || []).length
      ? `<div class="reader-links">${n.links
          .map(
            (l) => `<a class="link-chip" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">🔗 ${escapeHtml(l.label || l.url)}</a>`
          )
          .join('')}</div>`
      : '<p class="subtitle">No reference websites attached.</p>';

    const imagesHtml = (n.images || []).length
      ? `<div class="gallery-grid">${n.images
          .map((img, i) => {
            const src = `/notes/${encodeURIComponent(n.id)}/images/${encodeURIComponent(img.filename)}`;
            const cap = img.caption || `Image ${i + 1}`;
            return `
              <figure class="gallery-item" data-src="${escapeHtml(src)}" data-caption="${escapeHtml(cap)}">
                <img src="${escapeHtml(src)}" alt="${escapeHtml(cap)}" />
                <figcaption>${i + 1}. ${escapeHtml(cap)}</figcaption>
              </figure>
            `;
          })
          .join('')}</div>`
      : '<p class="subtitle">No images attached.</p>';

    readerVisual.innerHTML = `
      <h1>${escapeHtml(n.title)}</h1>
      <div class="reader-meta">
        Created ${formatDate(n.createdAt)} · Last updated ${formatDate(n.updatedAt)}
      </div>
      ${tagsHtml ? `<div class="tag-row">${tagsHtml}</div>` : ''}

      <section class="reader-section">
        <h2>1. What I Learned / Overview</h2>
        <div class="prose">${escapeHtml(n.answers?.overview || 'Not provided.')}</div>
      </section>

      <section class="reader-section">
        <h2>2. Ordered Process &amp; Steps</h2>
        ${stepsHtml}
      </section>

      <section class="reader-section">
        <h2>3. Detailed Notes (What Each Step Did)</h2>
        <div class="prose">${escapeHtml(n.answers?.details || 'Not provided.')}</div>
      </section>

      <section class="reader-section">
        <h2>4. Key Takeaways, Gotchas &amp; Next Time</h2>
        <div class="prose">${escapeHtml(n.answers?.takeaways || 'Not provided.')}</div>
      </section>

      <section class="reader-section">
        <h2>Reference Websites &amp; Links</h2>
        ${linksHtml}
      </section>

      <section class="reader-section">
        <h2>Attached Images &amp; Visuals</h2>
        ${imagesHtml}
      </section>
    `;

    readerVisual.querySelectorAll('.gallery-item').forEach((fig) => {
      fig.addEventListener('click', () => {
        lightboxImg.src = fig.dataset.src;
        lightboxCaption.textContent = fig.dataset.caption;
        lightbox.classList.remove('hidden');
      });
    });
  }

  // Navigation & Buttons
  document.getElementById('btnHome').addEventListener('click', () => showView('library'));
  document.getElementById('btnBackToLibrary').addEventListener('click', () => showView('library'));
  document.getElementById('btnCancelEdit').addEventListener('click', () => showView('library'));
  document.getElementById('btnCancelEditBottom').addEventListener('click', () => showView('library'));
  document.getElementById('btnNewNote').addEventListener('click', () => openEditor(null));

  tabVisual.addEventListener('click', () => setReaderTab('visual'));
  tabRaw.addEventListener('click', () => setReaderTab('raw'));

  document.getElementById('btnCopyReadme').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.currentReadme);
      showToast('README.md copied to clipboard!');
    } catch {
      showToast('Could not copy to clipboard.');
    }
  });

  document.getElementById('btnEditNote').addEventListener('click', () => {
    if (state.currentNote) openEditor(state.currentNote);
  });

  document.getElementById('btnDeleteNote').addEventListener('click', async () => {
    if (!state.currentNote) return;
    if (!confirm(`Delete "${state.currentNote.title}"? This removes its README.md and images.`)) return;
    const res = await fetch(`/api/notes/${encodeURIComponent(state.currentNote.id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      showToast('Note deleted.');
      await loadNotes(searchInput.value.trim());
      showView('library');
    }
  });

  document.getElementById('lightboxClose').addEventListener('click', () => lightbox.classList.add('hidden'));
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) lightbox.classList.add('hidden');
  });

  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadNotes(searchInput.value.trim()), 180);
  });

  initSpeechSupportBadge();
  loadNotes();
})();
