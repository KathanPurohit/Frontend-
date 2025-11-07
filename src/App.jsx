import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import LoginPage from "./LoginPage";
import CategoryPage from "./CategoryPage";

function App() {
  // ---- User State ----
  const [user, setUser] = useState(() => {
    const savedUser = sessionStorage.getItem("user");
    try {
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      sessionStorage.removeItem("user");
      return null;
    }
  });

  // ---- App/Game State ----
  const [ws, setWs] = useState(null);
  const [currentView, setCurrentView] = useState("menu");
  const [gameState, setGameState] = useState({
    players: [],
    question: "",
    questionIndex: 0,
    totalQuestions: 5,
    duration: 30,
    results: [],
    winner: null,
  });
  const [lobbyState, setLobbyState] = useState({ playerCount: 0, maxPlayers: 8 });
  const [answer, setAnswer] = useState("");
  const [answerResult, setAnswerResult] = useState(null);
  const [timer, setTimer] = useState(30);
  const timerRef = useRef(null);

  const [leaderboard, setLeaderboard] = useState([]);
  const [message, setMessage] = useState("");
  const [stats, setStats] = useState({});
  const [connectionStatus, setConnectionStatus] = useState("Disconnected");
  const [isLoading, setIsLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);

  // ---- API / WS URLs ----
  const API_BASE_URL =
    import.meta.env.VITE_API_URL || "https://backend-y4l4.onrender.com";

  const computedWSBase = API_BASE_URL.startsWith("https")
    ? API_BASE_URL.replace("https", "wss")
    : API_BASE_URL.replace("http", "ws");

  const WS_BASE_URL = import.meta.env.VITE_WS_URL || computedWSBase;

  // ---- Timer for playing view ----
  useEffect(() => {
    if (currentView === "playing") {
      timerRef.current = setInterval(() => {
        setTimer((t) => (t > 0 ? t - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [currentView, gameState.questionIndex]);

  useEffect(() => {
    if (timer === 0 && currentView === "playing" && !answerResult && ws) {
      ws.send(JSON.stringify({ type: "submit_answer", answer: "" }));
    }
  }, [timer, currentView, answerResult, ws]);

  // ---- WebSocket lifecycle ----
  useEffect(() => {
    if (user?.username) {
      const websocket = new WebSocket(`${WS_BASE_URL}/ws/${user.username}`);

      websocket.onopen = () => setConnectionStatus("Connected");
      websocket.onclose = () => setConnectionStatus("Disconnected");
      websocket.onerror = () => setConnectionStatus("Error");

      websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "stats_update") {
          setStats(data.stats);
          return;
        }

        switch (data.type) {
          case "waiting_update":
            setCurrentView("waiting");
            setLobbyState({
              playerCount: data.player_count,
              maxPlayers: data.max_players,
            });
            break;

          case "new_question":
            setCurrentView("playing");
            setGameState((gs) => ({
              ...gs,
              question: data.question,
              questionIndex: data.question_index,
              totalQuestions: data.total_questions,
              duration: data.duration,
            }));
            setTimer(data.duration);
            setAnswer("");
            setAnswerResult(null);
            break;

          case "answer_result":
            setAnswerResult(data);
            setTimeout(() => setAnswerResult(null), 1500);
            break;

          case "player_finished":
            setCurrentView("waiting");
            setMessage(data.message);
            break;

          case "game_end":
            setMessage("");
            setCurrentView("finished");
            setGameState((gs) => ({
              ...gs,
              results: data.results,
              winner: data.winner,
            }));
            const my = data.results.find((r) => r.username === user.username);
            if (my && my.new_total_score !== undefined) {
              setUser((prev) => ({ ...prev, score: my.new_total_score }));
            }
            loadLeaderboard();
            break;

          case "match_failed":
            setCurrentView("categories");
            setMessage(data.message);
            setTimeout(() => setMessage(""), 3000);
            break;

          default:
            break;
        }
      };

      setWs(websocket);
      return () => websocket.close();
    }
  }, [user?.username, WS_BASE_URL]);

  // ---- Sync State to Session Storage ----
  useEffect(() => {
    if (user) {
      sessionStorage.setItem("user", JSON.stringify(user));
    } else {
      sessionStorage.removeItem("user");
    }
  }, [user]);

  // ---- Initial data fetch ----
  useEffect(() => {
    loadLeaderboard();
    loadStats();
  }, []);

  // ---- API Calls ----
  const handleLogin = async (credentials) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setCurrentView("menu");
      } else {
        const err = await res.json();
        setMessage(err.detail || "Login failed");
      }
    } catch {
      setMessage("Connection error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (userData) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setCurrentView("menu");
      } else {
        const err = await res.json();
        setMessage(err.detail || "Signup failed");
      }
    } catch {
      setMessage("Connection error");
    } finally {
      setIsLoading(false);
    }
  };

  const loadLeaderboard = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/leaderboard`);
      if (res.ok) setLeaderboard(await res.json());
    } catch {}
  };

  const loadStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/stats`);
      if (res.ok) setStats(await res.json());
    } catch {}
  };

  // ---- Game actions ----
  const findMatch = () => setCurrentView("categories");

  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
    if (ws) ws.send(JSON.stringify({ type: "find_match", category: category.id }));
  };

  const handleBackToHome = () => {
    setCurrentView("menu");
    setMessage("");
  };

  const submitAnswer = (e) => {
    e.preventDefault();
    if (ws && answer.trim()) {
      ws.send(JSON.stringify({ type: "submit_answer", answer: answer.trim() }));
      setAnswer("");
    }
  };

  const cancelSearch = () => {
    if (ws) ws.send(JSON.stringify({ type: "cancel_search" }));
    setCurrentView("categories");
    setMessage("");
  };

  const logout = () => {
    setUser(null);
    setCurrentView("login");
  };

  // ---- Views ----
  if (!user) {
    return (
      <LoginPage
        isLogin={isLogin}
        setIsLogin={setIsLogin}
        onLogin={handleLogin}
        onSignup={handleSignup}
        message={message}
        isLoading={isLoading}
      />
    );
  }

  if (currentView === "categories") {
    return (
      <CategoryPage
        onSelectCategory={handleCategorySelect}
        onBackToHome={handleBackToHome}
        user={user}
        message={message}
      />
    );
  }

  // ---- WAITING VIEW ----
  if (currentView === "waiting") {
    return (
      <div className="app">
        <div className="container">
          <div className="waiting">
            {message ? (
              <>
                <h2>🏁 Finished!</h2>
                <p>{message}</p>
                <p>Waiting for other players...</p>
                <div className="spinner">⟳</div>
              </>
            ) : (
              <>
                <h2>🔍 Waiting for Players...</h2>
                <div className="spinner">⟳</div>
                <p>
                  Category: <strong>{selectedCategory?.name || "Any"}</strong>
                </p>
                <p>
                  Players: {lobbyState.playerCount} / {lobbyState.maxPlayers}
                </p>
                <button className="cancel-button" onClick={cancelSearch}>
                  Cancel Search
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- PLAYING VIEW ----
  if (currentView === "playing") {
    return (
      <div className="app">
        <div className="container">
          <div className="game">
            <h2>
              Question {gameState.questionIndex + 1} / {gameState.totalQuestions}
            </h2>
            
            <div style={{ textAlign: "center", fontSize: "1.2rem", color: "var(--text-secondary)" }}>
              Time Left: <strong>{timer}s</strong>
            </div>

            <div className="puzzle-container">
              <div className="puzzle-question">
                <h3 dangerouslySetInnerHTML={{ __html: gameState.question }} />
              </div>

              <form onSubmit={submitAnswer} className="answer-form">
                <div className="answer-section">
                  <input
                    type="text"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Type your answer..."
                    className="answer-input"
                    disabled={!!answerResult || timer === 0}
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="submit-answer-btn"
                    disabled={!!answerResult || timer === 0}
                  >
                    Submit
                  </button>
                </div>
              </form>

              {answerResult && (
                <div
                  className={`answer-feedback ${
                    answerResult.correct ? "correct" : "incorrect"
                  }`}
                  style={{ marginTop: "1rem", fontWeight: "bold", fontSize: "1.1rem" }}
                >
                  {answerResult.correct
                    ? `Correct! +${answerResult.score} pts`
                    : `Incorrect. The answer was: ${answerResult.correct_answer}`}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- FINISHED VIEW ----
  if (currentView === "finished") {
    return (
      <div className="app">
        <div className="container">
          <div className="finished">
            <h2>🎉 Game Over!</h2>
            <h3>
              {gameState.winner === user.username
                ? "You won!"
                : `Winner: ${gameState.winner}`}
            </h3>

            <div className="leaderboard" style={{ marginTop: "32px" }}>
              <h4>Final Scores:</h4>
              <div className="leaderboard-list">
                {/* ⭐️ ---- FIX: Changed ...map to .map ---- ⭐️ */}
                {gameState.results
                  .sort((a, b) => b.score - a.score)
                  .map((player, index) => (
                    <div
                      key={player.username}
                      className={`leaderboard-item ${
                        player.username === user.username ? "is-user" : ""
                      } ${player.username === gameState.winner ? "winner" : ""}`}
                    >
                      <span className="rank">#{index + 1}</span>
                      <span className="username">{player.username}</span>
                      <span className="score">{player.score} pts</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="finished-actions">
              <button className="play-button" onClick={() => setCurrentView("categories")}>
                🎮 Play Another
              </button>
              <button className="secondary-button" onClick={handleBackToHome}>
                🏠 Back to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- HOME / MENU ----
  if (currentView === "menu") {
    return (
      <div className="app">
        <div className="container">
          {/* Header */}
          <div className="app-header">
            <h1>🧠 MindMaze</h1>
            <button className="logout-btn" onClick={logout}>
              Logout
            </button>
          </div>

          {/* User Info */}
          <div className="user-info">
            <p>
              Welcome, <strong>{user.username}</strong>
            </p>
            <p>
              Score: <strong>{user.score || 0}</strong>
            </p>
            <p
              className={`status ${
                connectionStatus.toLowerCase() === "connected"
                  ? "connected"
                  : connectionStatus.toLowerCase() === "error"
                  ? "error"
                  : "disconnected"
              }`}
            >
              {connectionStatus}
            </p>
          </div>

          {/* Banner */}
          {message && <div className="message-banner">{message}</div>}

          {/* Menu */}
          <div className="menu">
            <div className="menu-actions">
              <button className="play-button" onClick={findMatch}>
                🚀 Start Challenge
              </button>
              <button
                className="refresh-button"
                onClick={() => {
                  loadStats();
                  loadLeaderboard();
                }}
              >
                🔄 Refresh
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr", // Stacks in 1 column (rows)
                gap: "24px",
              }}
            >
              {/* Stats */}
              <div className="stats">
                <h3>📊 Live Stats</h3>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="stat-label">Total Users</span>
                    <span className="stat-value">{stats.total_users || 0}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Active Games</span>
                    <span className="stat-value">{stats.active_games || 0}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Online Now</span>
                    <span className="stat-value">
                      {stats.connected_players || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Leaderboard */}
              <div className="leaderboard">
                <h3>🏆 Leaderboard</h3>
                {leaderboard.length === 0 ? (
                  <p className="no-players">No players yet.</p>
                ) : (
                  <div className="leaderboard-list">
                    {leaderboard.map((player, index) => (
                      <div
                        key={player.username || index}
                        className="leaderboard-item"
                      >
                        <span className="rank">#{index + 1}</span>
                        <span className="username">{player.username}</span>
                        <span className="score">{player.score || 0} pts</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* WebSocket Status Bubble */}
          <div
            style={{
              position: "fixed",
              right: "18px",
              bottom: "18px",
              background:
                connectionStatus === "Connected"
                  ? "rgba(34, 197, 94, 0.2)"
                  : connectionStatus === "Error"
                  ? "rgba(245, 158, 11, 0.2)"
                  : "rgba(239, 68, 68, 0.2)",
              color:
                connectionStatus === "Connected"
                  ? "#4ade80"
                  : connectionStatus === "Error"
                  ? "#fbbf24"
                  : "#f87171",
              border:
                connectionStatus === "Connected"
                  ? "1px solid rgba(34, 197, 94, 0.3)"
                  : connectionStatus === "Error"
                  ? "1px solid rgba(245, 158, 11, 0.3)"
                  : "1px solid rgba(239, 68, 68, 0.3)",
              padding: "8px 12px",
              borderRadius: "999px",
              backdropFilter: "blur(10px)",
              fontSize: "0.85rem",
              zIndex: 50,
            }}
          >
            {connectionStatus === "Connected"
              ? "🟢"
              : connectionStatus === "Error"
              ? "🟠"
              : "🔴"}{" "}
            {connectionStatus}
          </div>
        </div>
      </div>
    );
  }
}

export default App;
