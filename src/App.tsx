import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ChangeEvent,
  CSSProperties,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  SyntheticEvent,
  TouchEvent as ReactTouchEvent,
} from "react";
import type { BracketSize, GameState, PackItem, SavedSession, SongPack } from "./types";
import { builtInPacks } from "./data/packs";
import { createGame, getCurrentMatch, getProgress, getRanking, getRoundLabel, selectWinner, undoLastChoice } from "./lib/bracket";
import {
  getBracketSizesForPack,
  getItemMap,
  getYouTubeEmbedUrl,
  isSpotifyItem,
  isYouTubeItem,
  resolveAssetPath,
  validatePack,
  VALID_BRACKET_SIZES,
} from "./lib/pack";
import { loadSession, saveSession } from "./lib/storage";

const CATEGORY_LABELS: Record<PackItem["category"], string> = {
  "turkish-pop": "Türkçe Pop",
  "turkish-rap": "Türkçe Rap",
  "mixed/unknown": "Karışık",
};

const BRACKET_SIZES = VALID_BRACKET_SIZES;

type Notice = { tone: "good" | "bad" | "info"; text: string } | undefined;
type PlaylistSource = "youtube" | "spotify";

function detectPlaylistSource(url: string): PlaylistSource | null {
  const trimmed = url.trim();
  if (/youtube\.com|youtu\.be/i.test(trimmed)) return "youtube";
  if (/open\.spotify\.com|spotify\.com/i.test(trimmed)) return "spotify";
  return null;
}

export default function App() {
  const [session, setSession] = useState<SavedSession>(() => loadSession());
  const sessionRef = useRef(session);
  const [notice, setNotice] = useState<Notice>();
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistLimit, setPlaylistLimit] = useState<BracketSize>(128);
  const [isConvertingPlaylist, setIsConvertingPlaylist] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const packs = useMemo(() => [...builtInPacks, ...session.customPacks], [session.customPacks]);
  const selectedPack = packs.find((pack) => pack.id === session.selectedPackId) ?? builtInPacks[0];
  const availableSizes = getBracketSizesForPack(selectedPack);
  const selectedSize = availableSizes.includes(session.bracketSize)
    ? session.bracketSize
    : selectedPack.defaultBracketSize;
  const activeGame = session.gamesByPack[selectedPack.id];
  const itemMap = useMemo(() => getItemMap(selectedPack), [selectedPack]);
  const currentMatch = activeGame ? getCurrentMatch(activeGame) : undefined;
  const leftItem = currentMatch ? itemMap.get(currentMatch.leftId) : undefined;
  const rightItem = currentMatch ? itemMap.get(currentMatch.rightId) : undefined;
  const progress = activeGame ? getProgress(activeGame) : undefined;
  const ranking = activeGame ? getRanking(activeGame, selectedPack.items) : [];
  const categoryCounts = useMemo(() => getCategoryCounts(selectedPack), [selectedPack]);
  const hasYouTubeItems = selectedPack.items.some(isYouTubeItem);
  const hasSpotifyItems = selectedPack.items.some(isSpotifyItem);
  const selectedPackIsCustom = session.customPacks.some((pack) => pack.id === selectedPack.id);
  const hasInProgressGame = Boolean(activeGame && !activeGame.completedAt);
  const leftPanelVisible = session.uiPreferences.leftPanelOpen && !session.uiPreferences.focusMode;
  const rightPanelVisible = session.uiPreferences.rightPanelOpen && !session.uiPreferences.focusMode;
  const workspaceClassName = [
    "workspace",
    !leftPanelVisible ? "workspace-left-hidden" : "",
    !rightPanelVisible ? "workspace-right-hidden" : "",
    session.uiPreferences.focusMode ? "workspace-focus" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const detectedSource = detectPlaylistSource(playlistUrl);
  const playlistLimitLabel =
    detectedSource === "youtube" ? "Video limiti" : detectedSource === "spotify" ? "Şarkı limiti" : "İçerik limiti";
  const playlistLimitUnit = detectedSource === "youtube" ? "video" : detectedSource === "spotify" ? "şarkı" : "adet";

  useEffect(() => {
    sessionRef.current = session;
    saveSession(session);
  }, [session]);

  useEffect(() => {
    function persistLatestSession() {
      saveSession(sessionRef.current);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        persistLatestSession();
      }
    }

    window.addEventListener("pagehide", persistLatestSession);
    window.addEventListener("beforeunload", persistLatestSession);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    if ("storage" in navigator && typeof navigator.storage?.persist === "function") {
      void navigator.storage.persist().catch(() => undefined);
    }

    return () => {
      window.removeEventListener("pagehide", persistLatestSession);
      window.removeEventListener("beforeunload", persistLatestSession);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  function updateSession(updater: (current: SavedSession) => SavedSession) {
    setSession((current) => {
      const next = updater(current);
      sessionRef.current = next;
      saveSession(next);
      return next;
    });
  }

  function handlePackChange(packId: string) {
    const nextPack = packs.find((pack) => pack.id === packId) ?? builtInPacks[0];
    const nextSizes = getBracketSizesForPack(nextPack);
    updateSession((current) => ({
      ...current,
      selectedPackId: nextPack.id,
      bracketSize: nextSizes.includes(current.bracketSize) ? current.bracketSize : nextPack.defaultBracketSize,
    }));
    setNotice(undefined);
  }

  function handleSizeChange(size: BracketSize) {
    updateSession((current) => ({ ...current, bracketSize: size }));
  }

  function handleToggleLeftPanel() {
    updateSession((current) => {
      const isVisible = current.uiPreferences.leftPanelOpen && !current.uiPreferences.focusMode;

      return {
        ...current,
        uiPreferences: {
          ...current.uiPreferences,
          focusMode: false,
          leftPanelOpen: !isVisible,
        },
      };
    });
  }

  function handleToggleRightPanel() {
    updateSession((current) => {
      const isVisible = current.uiPreferences.rightPanelOpen && !current.uiPreferences.focusMode;

      return {
        ...current,
        uiPreferences: {
          ...current.uiPreferences,
          focusMode: false,
          rightPanelOpen: !isVisible,
        },
      };
    });
  }

  function handleToggleFocusMode() {
    updateSession((current) => ({
      ...current,
      uiPreferences: {
        ...current.uiPreferences,
        focusMode: !current.uiPreferences.focusMode,
      },
    }));
  }

  function handleStartGame() {
    const game = createGame(selectedPack, selectedSize);
    updateSession((current) => ({
      ...current,
      gamesByPack: {
        ...current.gamesByPack,
        [selectedPack.id]: game,
      },
    }));
    setNotice({ tone: "good", text: `${selectedSize}'lik yeni turnuva başladı.` });
  }

  function handlePick(itemId: string) {
    updateSession((current) => {
      const game = current.gamesByPack[selectedPack.id];

      if (!game) {
        return current;
      }

      return {
        ...current,
        gamesByPack: {
          ...current.gamesByPack,
          [selectedPack.id]: selectWinner(game, itemId),
        },
      };
    });
    setNotice(undefined);
  }

  function handleUndo() {
    updateSession((current) => {
      const game = current.gamesByPack[selectedPack.id];

      if (!game) {
        return current;
      }

      return {
        ...current,
        gamesByPack: {
          ...current.gamesByPack,
          [selectedPack.id]: undoLastChoice(game),
        },
      };
    });
    setNotice({ tone: "info", text: "Son seçim geri alındı." });
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as SongPack;
      const validation = validatePack(parsed);

      if (!validation.ok) {
        setNotice({ tone: "bad", text: validation.errors.slice(0, 3).join(" ") });
        return;
      }

      if (packs.some((pack) => pack.id === parsed.id)) {
        setNotice({ tone: "bad", text: `Bu pack id zaten var: ${parsed.id}` });
        return;
      }

      updateSession((current) => addOrReplaceCustomPack(current, parsed));
      setNotice({ tone: "good", text: `${parsed.title} içe aktarıldı.` });
    } catch (error) {
      setNotice({
        tone: "bad",
        text: error instanceof Error ? error.message : "JSON pack okunamadı.",
      });
    }
  }

  async function handlePlaylistSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUrl = playlistUrl.trim();

    if (!trimmedUrl) {
      setNotice({ tone: "bad", text: "Playlist URL'si gir." });
      return;
    }

    const source = detectPlaylistSource(trimmedUrl);

    if (!source) {
      setNotice({ tone: "bad", text: "URL YouTube veya Spotify linki olarak tanınmadı." });
      return;
    }

    setIsConvertingPlaylist(true);
    setNotice({ tone: "info", text: "Playlist okunuyor. Büyük listelerde biraz sürebilir." });

    try {
      const endpoint = source === "youtube" ? "/api/youtube-playlist" : "/api/spotify-playlist";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistUrl: trimmedUrl, limit: playlistLimit }),
      });
      const payload = (await response.json()) as { pack?: SongPack; error?: string };

      if (!response.ok || !payload.pack) {
        throw new Error(payload.error ?? "Playlist pack'e çevrilemedi.");
      }

      const validation = validatePack(payload.pack);

      if (!validation.ok) {
        throw new Error(validation.errors.slice(0, 3).join(" "));
      }

      updateSession((current) => addOrReplaceCustomPack(current, payload.pack!));
      setNotice({
        tone: "good",
        text: `${payload.pack.title} kaydedildi. ${payload.pack.items.length} ${
          source === "youtube" ? "video" : "şarkı"
        } eklendi.`,
      });
    } catch (error) {
      setNotice({
        tone: "bad",
        text:
          error instanceof Error
            ? error.message
            : "Playlist okunamadı. npm run dev ile local server açık olmalı.",
      });
    } finally {
      setIsConvertingPlaylist(false);
    }
  }

  function handleExportPack() {
    const blob = new Blob([JSON.stringify(selectedPack, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedPack.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleDeleteSelectedPack() {
    if (!selectedPackIsCustom) {
      return;
    }

    updateSession((current) => deleteCustomPack(current, selectedPack.id));
    setNotice({ tone: "info", text: `${selectedPack.title} silindi. Built-in pack'e dönüldü.` });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-kicker">yanSanayi</span>
          <span className="brand-title">UwUFUFU</span>
        </div>
        <div className="top-actions" aria-label="Pack araçları">
          <button
            className="icon-button"
            type="button"
            title={leftPanelVisible ? "Sol paneli kapat" : "Sol paneli aç"}
            aria-label={leftPanelVisible ? "Sol paneli kapat" : "Sol paneli aç"}
            aria-pressed={leftPanelVisible}
            onClick={handleToggleLeftPanel}
          >
            <PanelLeftIcon />
          </button>
          <button
            className="icon-button"
            type="button"
            title={session.uiPreferences.focusMode ? "Odak modunu kapat" : "Odak modunu aç"}
            aria-label={session.uiPreferences.focusMode ? "Odak modunu kapat" : "Odak modunu aç"}
            aria-pressed={session.uiPreferences.focusMode}
            onClick={handleToggleFocusMode}
          >
            <FocusIcon />
          </button>
          <button
            className="icon-button"
            type="button"
            title={rightPanelVisible ? "Sağ paneli kapat" : "Sağ paneli aç"}
            aria-label={rightPanelVisible ? "Sağ paneli kapat" : "Sağ paneli aç"}
            aria-pressed={rightPanelVisible}
            onClick={handleToggleRightPanel}
          >
            <PanelRightIcon />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Pack içe aktar"
            aria-label="Pack içe aktar"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Seçili pack'i dışa aktar"
            aria-label="Seçili pack'i dışa aktar"
            onClick={handleExportPack}
          >
            <DownloadIcon />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Son seçimi geri al"
            aria-label="Son seçimi geri al"
            disabled={!activeGame?.choices.length}
            onClick={handleUndo}
          >
            <UndoIcon />
          </button>
          <input ref={fileInputRef} className="visually-hidden" type="file" accept="application/json" onChange={handleImport} />
        </div>
      </header>

      <div className={workspaceClassName}>
        {leftPanelVisible ? (
        <aside className="panel panel-left" aria-label="Oyun ayarları">
          <section className="control-section">
            <label className="field-label" htmlFor="pack-select">
              Pack
            </label>
            <select id="pack-select" value={selectedPack.id} onChange={(event) => handlePackChange(event.target.value)}>
              {packs.map((pack) => (
                <option key={pack.id} value={pack.id}>
                  {pack.title}
                </option>
              ))}
            </select>
          </section>

          <form className="playlist-import" onSubmit={handlePlaylistSubmit}>
            <label className="field-label" htmlFor="playlist-url">
              Playlist URL
            </label>
            <input
              id="playlist-url"
              type="url"
              value={playlistUrl}
              placeholder="YouTube veya Spotify playlist linki yapıştırın"
              onChange={(event) => setPlaylistUrl(event.target.value)}
            />
            {playlistUrl.trim() ? (
              <p className={`source-detect source-detect-${detectedSource ?? "unknown"}`}>
                {detectedSource === "youtube"
                  ? "YouTube playlist algılandı."
                  : detectedSource === "spotify"
                    ? "Spotify playlist algılandı."
                    : "YouTube veya Spotify playlist linki bekleniyor."}
              </p>
            ) : null}
            <div className="playlist-row">
              <label className="visually-hidden" htmlFor="playlist-limit">
                {playlistLimitLabel}
              </label>
              <select
                id="playlist-limit"
                value={playlistLimit}
                onChange={(event) => setPlaylistLimit(Number(event.target.value) as BracketSize)}
              >
                {BRACKET_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} {playlistLimitUnit}
                  </option>
                ))}
              </select>
              <button className="secondary-action" type="submit" disabled={isConvertingPlaylist}>
                {isConvertingPlaylist ? "Okunuyor" : "URL'den kaydet"}
              </button>
            </div>
          </form>

          <section className="control-section">
            <span className="field-label">Bracket</span>
            <div className="segmented" role="group" aria-label="Bracket boyutu">
              {BRACKET_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  aria-pressed={selectedSize === size}
                  disabled={!availableSizes.includes(size)}
                  onClick={() => handleSizeChange(size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </section>

          <button className="primary-action" type="button" onClick={handleStartGame}>
            <PlayIcon />
            Yeni turnuva
          </button>

          {hasInProgressGame ? <p className="continue-note">Bu destede devam eden turnuva var.</p> : null}

          {notice ? <p className={`notice notice-${notice.tone}`}>{notice.text}</p> : null}

          <section className="pack-facts" aria-label="Pack bilgisi">
            <div>
              <span>{selectedPack.items.length}</span>
              <strong>Şarkı</strong>
            </div>
            <div>
              <span>{categoryCounts.rap}</span>
              <strong>Rap</strong>
            </div>
            <div>
              <span>{categoryCounts.pop}</span>
              <strong>Pop</strong>
            </div>
          </section>

          <p className="fine-print">
            {hasYouTubeItems
              ? "YouTube pack videoları embed eder; site statik kalır ama oynatma için internet gerekir."
              : hasSpotifyItems
                ? "Spotify pack kapak kartlarıyla oynanır; oluşturulan desteler bu tarayıcıda kaydedilir."
                : "Runtime offline çalışır. Kaynak URL'leri yalnızca veri izleme bilgisidir; oyun açılırken dış istek yapılmaz."}
          </p>
        </aside>
        ) : null}

        <section className="play-surface" aria-label="Oyun alanı">
          <GameHeader game={activeGame} progress={progress} pack={selectedPack} />
          {!activeGame ? (
            <StartState pack={selectedPack} size={selectedSize} onStart={handleStartGame} />
          ) : activeGame.completedAt ? (
            <ResultState game={activeGame} ranking={ranking} onRestart={handleStartGame} />
          ) : leftItem && rightItem ? (
            <Matchup leftItem={leftItem} rightItem={rightItem} game={activeGame} onPick={handlePick} />
          ) : (
            <p className="empty-state">Bu turnuvanın sıradaki eşleşmesi okunamadı.</p>
          )}
        </section>

        {rightPanelVisible ? (
        <aside className="panel panel-right" aria-label="Sıralama">
          <section className="ranking-section">
            <div className="section-heading">
              <span>Canlı sıralama</span>
              <strong>{activeGame ? `${activeGame.choices.length}/${activeGame.bracketSize - 1}` : "0/0"}</strong>
            </div>
            {ranking.length > 0 ? (
              <ol className="ranking-list">
                {ranking.slice(0, 10).map((item) => (
                  <li key={item.id}>
                    <img src={getArtworkSrc(item)} alt="" onError={handleImageFallback} />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.artist}</small>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">İlk seçimden sonra burası dolmaya başlar.</p>
            )}
          </section>

          <section className="source-section">
            <div className="section-heading">
              <span>Kaynak notları</span>
            </div>
            <ul>
              {selectedPack.sourceRefs.map((source) => (
                <li key={`${source.label}-${source.url ?? "local"}`}>{source.label}</li>
              ))}
            </ul>
          </section>

          <section className="deck-management" aria-label="Deste yönetimi">
            <div className="section-heading">
              <span>Deste yönetimi</span>
            </div>
            {selectedPackIsCustom ? (
              <button className="danger-action" type="button" onClick={handleDeleteSelectedPack}>
                Kaydedilen desteyi sil
              </button>
            ) : (
              <p className="muted">Built-in deste silinemez.</p>
            )}
          </section>
        </aside>
        ) : null}
      </div>
    </main>
  );
}

function GameHeader({
  game,
  progress,
  pack,
}: {
  game?: GameState;
  progress?: { completed: number; total: number; percent: number };
  pack: SongPack;
}) {
  return (
    <div className="game-header">
      <div>
        <span className="eyebrow">{pack.title}</span>
        <h1>{game ? getRoundLabel(game) : "Turnuvayı başlat"}</h1>
      </div>
      {game && progress ? (
        <div className="progress-block" aria-label="Turnuva ilerlemesi">
          <span>{progress.percent}%</span>
          <div className="progress-track">
            <div style={{ width: `${progress.percent}%` }} />
          </div>
          <small>
            {progress.completed} / {progress.total}
          </small>
        </div>
      ) : null}
    </div>
  );
}

function StartState({ pack, size, onStart }: { pack: SongPack; size: BracketSize; onStart: () => void }) {
  return (
    <div className="start-state">
      <div className="cover-strip" aria-hidden="true">
        {pack.items.slice(0, 8).map((item) => (
          <img key={item.id} src={getArtworkSrc(item)} alt="" onError={handleImageFallback} />
        ))}
      </div>
      <div className="start-copy">
        <h2>İki şarkı gelir, birini seçersin.</h2>
        <p>{size} adaydan tek şampiyon çıkar. Kaldığın yer otomatik kaydedilir.</p>
        <button className="primary-action" type="button" onClick={onStart}>
          <PlayIcon />
          Başlat
        </button>
      </div>
    </div>
  );
}

function Matchup({
  leftItem,
  rightItem,
  game,
  onPick,
}: {
  leftItem: PackItem;
  rightItem: PackItem;
  game: GameState;
  onPick: (itemId: string) => void;
}) {
  const pickingRef = useRef(false);

  function handlePick(itemId: string) {
    if (pickingRef.current) return;
    pickingRef.current = true;
    onPick(itemId);
    setTimeout(() => {
      pickingRef.current = false;
    }, 400);
  }

  return (
    <div className="matchup" data-round={game.currentRoundIndex}>
      <p className="swipe-mobile-hint">Kartı yana kaydırarak seçebilirsin.</p>
      <SwipeableCard item={leftItem} side="left" onPick={handlePick} />
      <div className="versus" aria-hidden="true">
        VS
      </div>
      <SwipeableCard item={rightItem} side="right" onPick={handlePick} />
    </div>
  );
}

function SwipeableCard({
  item,
  side,
  onPick,
}: {
  item: PackItem;
  side: "left" | "right";
  onPick: (itemId: string) => void;
}) {
  const [dragX, setDragX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const startRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const suppressClickRef = useRef(false);

  const swipeProgress = Math.min(Math.abs(dragX) / 120, 1);
  const swipeDirection = dragX >= 0 ? "right" : "left";
  const swipeStyle = {
    "--swipe-x": `${dragX}px`,
    "--swipe-rotate": `${dragX * 0.035}deg`,
    "--swipe-progress": String(swipeProgress),
  } as CSSProperties;

  function resetSwipe() {
    setDragX(0);
    setIsAnimating(false);
  }

  function finishSwipe(deltaX: number, deltaY: number) {
    if (Math.abs(deltaX) < 62 || Math.abs(deltaY) > Math.abs(deltaX) * 1.1) {
      setDragX(0);
      return;
    }

    suppressClickRef.current = true;
    setIsAnimating(true);
    setDragX(deltaX > 0 ? 420 : -420);
    setTimeout(() => {
      onPick(item.id);
      resetSwipe();
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }, 180);
  }

  function handleDirectPick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    onPick(item.id);
  }

  function handleTouchStart(e: ReactTouchEvent) {
    if (isAnimating) return;
    startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
  }

  function handleTouchMove(e: ReactTouchEvent) {
    if (!startRef.current || isAnimating) return;
    const deltaX = e.touches[0].clientX - startRef.current.x;
    setDragX(Math.max(-150, Math.min(150, deltaX * 0.75)));
  }

  function handleTouchEnd(e: ReactTouchEvent) {
    if (!startRef.current || isAnimating) return;
    const deltaX = e.changedTouches[0].clientX - startRef.current.x;
    const deltaY = e.changedTouches[0].clientY - startRef.current.y;
    startRef.current = null;
    finishSwipe(deltaX, deltaY);
  }

  function handleMouseDown(e: ReactMouseEvent) {
    if (isAnimating) return;
    startRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };

    function onMove(moveEvent: MouseEvent) {
      if (!startRef.current) return;
      const deltaX = moveEvent.clientX - startRef.current.x;
      setDragX(Math.max(-150, Math.min(150, deltaX * 0.75)));
    }

    function onUp(upEvent: MouseEvent) {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (!startRef.current || isAnimating) return;
      const deltaX = upEvent.clientX - startRef.current.x;
      const deltaY = upEvent.clientY - startRef.current.y;
      startRef.current = null;
      finishSwipe(deltaX, deltaY);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div
      className={`swipe-shell swipe-shell-${side} ${isAnimating ? "is-throwing" : ""}`}
      style={swipeStyle}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
    >
      <SongChoice item={item} side={side} onPick={handleDirectPick} />
      <span className={`swipe-feedback swipe-feedback-${swipeDirection}`} aria-hidden="true">
        {swipeDirection === "right" ? "Sağa kaydır" : "Sola kaydır"}
      </span>
    </div>
  );
}

function SongChoice({
  item,
  side,
  onPick,
}: {
  item: PackItem;
  side: "left" | "right";
  onPick: (itemId: string) => void;
}) {
  if (isYouTubeItem(item)) {
    return (
      <article className={`youtube-choice youtube-${side}`}>
        <div className="youtube-frame-wrap">
          <iframe
            src={getYouTubeEmbedUrl(item)}
            title={`${item.artist} - ${item.title}`}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
        <div className="youtube-meta">
          <span className="category-chip">YouTube</span>
          <strong>{item.title}</strong>
          <small>
            {item.artist}
            {item.durationSeconds ? ` • ${formatDuration(item.durationSeconds)}` : ""}
          </small>
          <button className="pick-button" type="button" onClick={() => onPick(item.id)}>
            Bunu seç
          </button>
        </div>
      </article>
    );
  }

  return (
    <button className={`choice-card choice-${side}`} type="button" onClick={() => onPick(item.id)}>
      <span className="choice-image-wrap">
        <img src={getArtworkSrc(item)} alt={`${item.artist} - ${item.title}`} onError={handleImageFallback} />
      </span>
      <span className="choice-meta">
        <span className="category-chip">{CATEGORY_LABELS[item.category]}</span>
        <strong>{item.title}</strong>
        <small>
          {item.artist}
          {item.year ? ` • ${item.year}` : ""}
        </small>
      </span>
    </button>
  );
}

function ResultState({ game, ranking, onRestart }: { game: GameState; ranking: PackItem[]; onRestart: () => void }) {
  const champion = ranking[0];

  return (
    <div className="result-state">
      {champion ? (
        <>
          {isYouTubeItem(champion) ? (
            <div className="champion-video">
              <iframe
                src={getYouTubeEmbedUrl(champion)}
                title={`${champion.artist} - ${champion.title}`}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          ) : (
            <img className="champion-cover" src={getArtworkSrc(champion)} alt={`${champion.artist} - ${champion.title}`} onError={handleImageFallback} />
          )}
          <div className="result-copy">
            <span className="eyebrow">Şampiyon</span>
            <h2>{champion.title}</h2>
            <p>{champion.artist}</p>
            <small>{game.bracketSize} aday, {game.choices.length} seçim</small>
          </div>
        </>
      ) : (
        <p className="empty-state">Sonuç sıralaması üretilemedi.</p>
      )}
      <button className="primary-action" type="button" onClick={onRestart}>
        <PlayIcon />
        Yeniden oyna
      </button>
    </div>
  );
}

function getCategoryCounts(pack: SongPack) {
  return pack.items.reduce(
    (counts, item) => {
      if (item.category === "turkish-pop") counts.pop += 1;
      if (item.category === "turkish-rap") counts.rap += 1;
      if (item.category === "mixed/unknown") counts.mixed += 1;
      return counts;
    },
    { pop: 0, rap: 0, mixed: 0 },
  );
}

function addOrReplaceCustomPack(session: SavedSession, pack: SongPack): SavedSession {
  const customPacks = session.customPacks.some((customPack) => customPack.id === pack.id)
    ? session.customPacks.map((customPack) => (customPack.id === pack.id ? pack : customPack))
    : [...session.customPacks, pack];

  return {
    ...session,
    selectedPackId: pack.id,
    bracketSize: pack.defaultBracketSize,
    customPacks,
  };
}

function deleteCustomPack(session: SavedSession, packId: string): SavedSession {
  const fallbackPack = builtInPacks[0];
  const gamesByPack = { ...session.gamesByPack };
  delete gamesByPack[packId];

  return {
    ...session,
    selectedPackId: session.selectedPackId === packId ? fallbackPack.id : session.selectedPackId,
    bracketSize: session.selectedPackId === packId ? fallbackPack.defaultBracketSize : session.bracketSize,
    customPacks: session.customPacks.filter((pack) => pack.id !== packId),
    gamesByPack,
  };
}

function handleImageFallback(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  const fallback = resolveAssetPath("packs/fallback-cover.svg");

  if (!image.src.endsWith("fallback-cover.svg")) {
    image.src = fallback;
  }
}

function getArtworkSrc(item: PackItem): string {
  if (item.imagePath) {
    return resolveAssetPath(item.imagePath);
  }

  if (item.thumbnailUrl) {
    return item.thumbnailUrl;
  }

  if (isYouTubeItem(item)) {
    return `https://i.ytimg.com/vi/${item.youtubeVideoId}/hqdefault.jpg`;
  }

  return resolveAssetPath("packs/fallback-cover.svg");
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12m0-12 4.5 4.5M12 3 7.5 7.5M5 15v4h14v-4" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21V9m0 12 4.5-4.5M12 21l-4.5-4.5M5 9V5h14v4" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 7H4v5m.5-4.5A8 8 0 1 1 5.8 18" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m8 5 11 7-11 7V5Z" />
    </svg>
  );
}

function PanelLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16v14H4V5Z" />
      <path d="M10 5v14" />
    </svg>
  );
}

function PanelRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16v14H4V5Z" />
      <path d="M14 5v14" />
    </svg>
  );
}

function FocusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4H4v4" />
      <path d="M16 4h4v4" />
      <path d="M20 16v4h-4" />
      <path d="M8 20H4v-4" />
      <path d="M9 9h6v6H9V9Z" />
    </svg>
  );
}
