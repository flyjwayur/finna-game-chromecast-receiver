/**
 * Starcast game.
 *
 * Shows a spaceship for each AVAILABLE player. Automatically transitions
 * AVAILABLE players to PLAYING. Moves spaceships and fires "bullets" at
 * incoming rockets when senders send a custom game message.
 *
 * @param {!cast.receiver.games.GameManager} gameManager
 * @constructor
 * @implements {cast.games.common.receiver.Game}
 * @export
 */
cast.games = {};
cast.games.starcast = {};
cast.games.starcast.StarcastGame = function (gameManager) {
  /** @private {!cast.receiver.games.GameManager} */
  this.gameManager_ = gameManager;

  /**
   * Debug only. Call debugUi.open() or close() to show and hide an overlay
   * showing game manager and player information while testing and debugging.
   * @public {cast.receiver.games.debug.DebugUI}
   */
  this.debugUi = new cast.receiver.games.debug.DebugUI(this.gameManager_);
  //this.debugUi.open();

  /**
   * Debug only. Set to true to allow players to move and fire by themselves.
   * Requires players to be added beforehand. Useful for testing and debugging.
   * For standalone testing on a locally hosted web server with no senders,
   * you can add a virtual player by typing this in the dev console in one line:
   * game.gameManager_.updatePlayerState(null, cast.receiver.games.PlayerState.
   * AVAILABLE)
   * @public {boolean}
   */
  this.randomAiEnabled = false;

  /** @private {number} */
  this.canvasWidth_ = window.innerWidth;

  /** @private {number} */
  this.canvasHeight_ = window.innerHeight;

  /** @private {number} */
  this.puzzleWidth_ = 384;

  this.puzzleHeight_ = 384;

  /** @private {number} */
  this.MAX_PLAYERS_ = 4;

  /** @private {!Array.<!PIXI.Sprite>} All player sprites. */
  this.players_ = [];

  /**
   * A map from player ids to player sprites.
   * @private {!Object.<string, !PIXI.Sprite>}.
   */
  this.playerMap_ = {};

  /** @private an image from Finna API. */
  this.apiImage_ = null;

  /** @private {!Array.<!PIXI.Sprite>} All pieces sprites. */
  this.pieces_ = [];

  /** Count flip for the suggestion */
  this.suggestedFlipCount_ = 0;

  this.extraFlipsThanNecessary_ = 10;

  /** Count flip in each round, when players click rows and columns */
  this.playerEachFlipCount_ = 0;

  /** @private {PIXI.Sprite} The background. */
  this.backgroundSprite_ = null;

  /** @private {function(number)} Pre-bound call to #update. */
  this.boundUpdateFunction_ = this.update_.bind(this);

  /** @private {boolean} */
  this.isLoaded_ = false;

  /** @private {boolean} */
  this.isRunning_ = false;

  /** @private {!PIXI.Container} */
  this.container_ = new PIXI.Container();

  this.hud_ = null;

  /** @private {!PIXI.WebGLRenderer} */
  this.canvasrenderer_ = new PIXI.CanvasRenderer(this.canvasWidth_,
    this.canvasHeight_);
  this.canvasrenderer_.backgroundColor = 0x061639;

  /** @private {!PIXI.loaders.Loader} */
  this.loader_ = new PIXI.loaders.Loader();
  this.loader_.add('assets/tileset.png');
  this.loader_.add('assets/background.jpg');
  this.loader_.add('assets/player.png');
  this.loader_.add('assets/controlButtons.json');
  this.loader_.add('assets/starControl_diagonal.png');
  this.loader_.once('complete', this.onAssetsLoaded_.bind(this));

  /** @private {?function()} Callback used with #run. */
  this.loadedCallback_ = null;

  /**
   * Pre-bound message callback.
   * @private {function(cast.receiver.games.Event)}
   */
  this.boundGameMessageCallback_ = this.onGameMessage_.bind(this);

  /**
   * Pre-bound player connect callback.
   * @private {function(cast.receiver.games.Event)}
   */
  this.boundPlayerAvailableCallback_ = this.onPlayerAvailable_.bind(this);

  /**
   * Pre-bound player quit callback.
   * @private {function(cast.receiver.games.Event)}
   */
  this.boundPlayerQuitCallback_ = this.onPlayerQuit_.bind(this);
};


/**
 * JSON message field used to move.
 * @private
 */
cast.games.starcast.StarcastGame.ROW_OR_COL_FIELD_ = "rowOrCol";
cast.games.starcast.StarcastGame.NUM_ROW_OR_COL_FIELD_ = "numRowOrCol";

/**
 * Runs the game. Game should load if not loaded yet.
 * @param {function()} loadedCallback This function will be called when the game
 *     finishes loading or is already loaded and about to actually run.
 * @export
 */
cast.games.starcast.StarcastGame.prototype.run = function (loadedCallback) {
  // If the game is already running, return immediately.
  if (this.isRunning_) {
    loadedCallback();
    return;
  }

  // Start loading if game not loaded yet.
  this.loadedCallback_ = loadedCallback;
  if (!this.isLoaded_) {
    this.loader_.load();
    return;
  }

  // Start running.
  this.start_();
};


/**
 * Stops the game.
 * @export
 */
cast.games.starcast.StarcastGame.prototype.stop = function () {
  if (this.loadedCallback_ || !this.isRunning_) {
    this.loadedCallback_ = null;
    return;
  }

  this.isRunning_ = false;
  //document.body.removeChild(this.renderer_.view);
  document.body.removeChild(this.canvasrenderer_.view);

  this.gameManager_.removeEventListener(
    cast.receiver.games.EventType.GAME_MESSAGE_RECEIVED,
    this.boundGameMessageCallback_);
  this.gameManager_.removeEventListener(
    cast.receiver.games.EventType.PLAYER_AVAILABLE,
    this.boundPlayerAvailableCallback_);
  this.gameManager_.removeEventListener(
    cast.receiver.games.EventType.PLAYER_QUIT,
    this.boundPlayerQuitCallback_);
  this.gameManager_.removeEventListener(
    cast.receiver.games.EventType.PLAYER_DROPPED,
    this.boundPlayerQuitCallback_);
};


/**
 * Adds the renderer and run the game. Calls loaded callback passed to #run.
 * @private
 */
cast.games.starcast.StarcastGame.prototype.start_ = function () {
  // If callback is null, the game was stopped already.
  if (!this.loadedCallback_) {
    return;
  }

  document.body.appendChild(this.canvasrenderer_.view);
  //document.body.appendChild(this.renderer_.view);
  this.isRunning_ = true;
  this.gameManager_.updateGameplayState(
    cast.receiver.games.GameplayState.RUNNING, null);

  // Add any already connected players.
  var players = this.gameManager_.getPlayers();
  for (var i = 0; i < players.length; i++) {
    this.addPlayer_(players[i].playerId);
  }

  requestAnimationFrame(this.boundUpdateFunction_);

  this.loadedCallback_();
  this.loadedCallback_ = null;

  this.gameManager_.addEventListener(
    cast.receiver.games.EventType.GAME_MESSAGE_RECEIVED,
    this.boundGameMessageCallback_);
  this.gameManager_.addEventListener(
    cast.receiver.games.EventType.PLAYER_AVAILABLE,
    this.boundPlayerAvailableCallback_);
  this.gameManager_.addEventListener(
    cast.receiver.games.EventType.PLAYER_QUIT,
    this.boundPlayerQuitCallback_);
  this.gameManager_.addEventListener(
    cast.receiver.games.EventType.PLAYER_DROPPED,
    this.boundPlayerQuitCallback_);
};

cast.games.starcast.StarcastGame.prototype.instantiatePuzzlePiecesAndControlButtons = function (totalRow, totalCol,
                                                                                                container, buttonTextureId,
                                                                                                diagonalControlButton) {

  var buttonXDist = Math.floor(this.puzzleWidth_ / totalCol),
      buttonYDist = Math.floor(this.puzzleHeight_ / totalRow);

  var pieceWidth = Math.floor(this.apiImage_.width / totalCol),
      pieceHeight = Math.floor(this.apiImage_.height / totalRow);

  var leftSideButtonsArray = [];
  leftSideButtonsArray.push(new PIXI.Sprite(buttonTextureId["greenButton.png"]));
  leftSideButtonsArray.push(new PIXI.Sprite(buttonTextureId["blueButton.png"]));
  leftSideButtonsArray.push(new PIXI.Sprite(buttonTextureId["yellowButton.png"]));
  leftSideButtonsArray.push(new PIXI.Sprite(buttonTextureId["redButton.png"]));
  leftSideButtonsArray.push(new PIXI.Sprite(buttonTextureId["purpleButton.png"]));
  leftSideButtonsArray.push(new PIXI.Sprite(buttonTextureId["greenButton.png"]));

  var bottomSideButtonsArray = [];
  bottomSideButtonsArray.push(new PIXI.Sprite(buttonTextureId["greenButton.png"]));
  bottomSideButtonsArray.push(new PIXI.Sprite(buttonTextureId["blueButton.png"]));
  bottomSideButtonsArray.push(new PIXI.Sprite(buttonTextureId["yellowButton.png"]));
  bottomSideButtonsArray.push(new PIXI.Sprite(buttonTextureId["redButton.png"]));
  bottomSideButtonsArray.push(new PIXI.Sprite(buttonTextureId["purpleButton.png"]));
  bottomSideButtonsArray.push(new PIXI.Sprite(buttonTextureId["greenButton.png"]));

    for (var row = 0; row < totalRow; row++) {
    this.pieces_.push([]);
    createLeftSideButtons(leftSideButtonsArray, row, totalRow, totalCol, buttonXDist, buttonYDist, container);
    for (var col = 0; col < totalCol; col++) {
      this.pieces_[row].push(
        this.createSpriteFromSpriteSheet.bind(this)(pieceWidth, pieceHeight, row, col,
          totalRow, totalCol, container)
      );
      createBottomSideButtons(bottomSideButtonsArray, col, totalRow, totalCol, buttonXDist, buttonYDist, container);
    }
  }

  //Make a position for the diagonal control button
  diagonalControlButton.position.set(leftSideButtonsArray[0].x, bottomSideButtonsArray[0].y);
  container.addChild(diagonalControlButton);

  // flip random rows
  for (row = 0; row < totalRow; row++) {
    if (Math.random() < 0.5) {
      for (col = 0; col < totalCol; col++) {
        flipPiece(this.pieces_[row][col]);
      }
      this.suggestedFlipCount_++;
    }
  }
  // flip random cols
  for (col = 0; col < totalCol; col++) {
    if (Math.random() < 0.5) {
      for (row = 0; row < totalRow; row++) {
        flipPiece(this.pieces_[row][col]);
      }
      this.suggestedFlipCount_++;
    }
  }

  // randomly flip diagonal or not
  if (Math.random() < 0.5) {
    for (var i = 0; i < totalCol; i++) {
      flipPiece(this.pieces_[this.pieces_.length - i - 1][i]);
    }
    this.suggestedFlipCount_++;
  }

  this.checkFlipsFromPlayerMessage();
  this.displayFlipSuggestionMessage();
};

function createLeftSideButtons(buttonsArray, row, totalRow, totalCol, buttonXdist, buttonYdist, container) {
  var button = buttonsArray[row % buttonsArray.length];
  // set a button at top left of the puzzles
  button.position.x = container.width / 2 - buttonXdist / 2 - (buttonXdist * (totalCol + 1.6) / 2);
  button.position.y = container.height / 2 - buttonYdist / 2 - (buttonYdist * (totalRow - 0.2) / 2);
  // set button's proper y
  button.position.y = button.position.y + (buttonYdist * row);
  container.addChild(button);
}

function createBottomSideButtons(buttonsArray, col, totalRow, totalCol, buttonXdist, buttonYdist, container) {
  var button = buttonsArray[col % buttonsArray.length];
  // set a button at top left of the puzzles
  button.position.x = container.width / 2 - buttonXdist / 2 - (buttonXdist * (totalCol - 0.2) / 2);
  button.position.y = container.height / 2 - buttonYdist / 2 + (buttonYdist * (totalRow + 0.1) / 2);
  // set button's proper y
  button.position.x = button.position.x + (buttonYdist * col);
  container.addChild(button);
}

cast.games.starcast.StarcastGame.prototype.createSpriteFromSpriteSheet = function (width, height, row, col,
                                                                                   totalRow, totalCol, container) {

  var rectangle = new PIXI.Rectangle(width * col, height * row, width, height);
  //Tell the texture to use that rectangular section
  // var texture = new PIXI.Texture(PIXI.BaseTexture.fromImage("assets/tileset.png"));
  var base = new PIXI.BaseTexture(this.apiImage_),
    texture = new PIXI.Texture(base);
  texture.frame = rectangle;
  var piece = new PIXI.Sprite(texture);

  // Center all pieces
  piece.x = container.width / 2 - piece.width / 2 - (width * totalCol / 2);
  piece.y = container.height / 2 - piece.height / 2 - (height * totalRow / 2);

  // Scale all pieces
  // Resize the puzzle image to display the whole puzzle image
  var imageXRatio = this.apiImage_.width / this.puzzleWidth_;
  var imageYRatio = this.apiImage_.height / this.puzzleHeight_;

  var XScaleRate = 1 / imageXRatio;
  var YScaleRate = 1 / imageYRatio;

  piece.scale.x = XScaleRate;
  piece.scale.y = YScaleRate;

  // Spread pieces evenly
  // Widen the space between pieces after scaling the pieces
  piece.x = piece.x + (width * col * XScaleRate);
  piece.y = piece.y + (height * row * YScaleRate);

  // boolean flag for solution checking
  piece.flipped = false;

  // add piece to stage
  container.addChild(piece);

  return piece;
}

/**
 *
 * Loading cropped sprite as a rectangle frame for finna API image
 *
 **/

cast.games.starcast.StarcastGame.prototype.imageOnLoad = function (event) {

  this.instantiatePuzzlePiecesAndControlButtons.bind(this)(this.totalPuzzleRows, this.totalPuzzleColumns,
    this.container_, this.loader_.resources["assets/controlButtons.json"].textures, this.diagonalControlButton_);
};


/**
 * Called when all assets are loaded.
 * @private
 */
cast.games.starcast.StarcastGame.prototype.onAssetsLoaded_ = function () {
  this.totalPuzzleRows = 6;
  this.totalPuzzleColumns = 6;
  this.backgroundSprite_ =
    PIXI.Sprite.fromImage('assets/background.jpg');
  this.backgroundSprite_.width = this.canvasWidth_;
  this.backgroundSprite_.height = this.canvasHeight_;
  this.container_.addChild(this.backgroundSprite_);

  this.diagonalControlButton_ = PIXI.Sprite.fromImage("assets/starControl_diagonal.png");

  //Get Architecture images from Fingna API
  var testURL = "https://api.finna.fi/Cover/Show?id=muusa.urn%3Auuid%3A7682B120-4F8E-4210-AD4D-1B118BA7699E&index=0&size=large";
  this.apiImage_ = new Image();
  this.apiImage_.addEventListener("load", this.imageOnLoad.bind(this));
  this.apiImage_.src = testURL;

  for (var i = 0; i < this.MAX_PLAYERS_; i++) {
    var player = PIXI.Sprite.fromImage('assets/player.png');
    player.anchor.x = 0.5;
    player.anchor.y = 0.5;
    player.position.x = 60;
    player.position.y = this.canvasHeight_ / 2;
    player.scale.x = player.scale.y = 1;
    player.visible = false;
    this.container_.addChild(player);

    this.players_.push(player);
  }

  this.start_();
};


/**
 * Updates the game on each animation frame.
 * @param {number} timestamp
 * @private
 */
cast.games.starcast.StarcastGame.prototype.update_ = function (timestamp) {
  if (!this.isRunning_) {
    return;
  }

  requestAnimationFrame(this.boundUpdateFunction_);

  this.canvasrenderer_.render(this.container_);
};

/**
 * Handles when a player becomes available to the game manager.
 * @param {cast.receiver.games.Event} event
 * @private
 */
cast.games.starcast.StarcastGame.prototype.onPlayerAvailable_ =
  function (event) {
    if (event.statusCode != cast.receiver.games.StatusCode.SUCCESS) {
      console.log('Error: Event status code: ' + event.statusCode);
      console.log('Reason for error: ' + event.errorDescription);
      return;
    }

    var playerId = /** @type {string} */ (event.playerInfo.playerId);
    // Automatically transition available players to playing state.
    this.gameManager_.updatePlayerState(playerId,
      cast.receiver.games.PlayerState.PLAYING, null);

    this.addPlayer_(playerId);
  };


/**
 * Adds a player to the game.
 * @param {string} playerId
 * @private
 */
cast.games.starcast.StarcastGame.prototype.addPlayer_ = function (playerId) {
  // Check if player is already on the screen.
  var playerSprite = this.playerMap_[playerId];
  if (playerSprite && playerSprite.visible) {
    return;
  }

  // Assign first available player sprite to new player.
  for (var i = 0; i < this.MAX_PLAYERS_; i++) {
    var player = this.players_[i];
    if (player && !player.visible) {
      // Associate player sprite with player ID.
      this.playerMap_[playerId] = player;
      player.visible = true;
      player.tint = Math.random() * 0xffffff;
      break;
    }
  }
};


/**
 * Handles when a player disconnects from the game manager.
 * @param {cast.receiver.games.Event} event
 * @private
 */
cast.games.starcast.StarcastGame.prototype.onPlayerQuit_ =
  function (event) {
    if (event.statusCode != cast.receiver.games.StatusCode.SUCCESS) {
      console.log('Error: Event status code: ' + event.statusCode);
      console.log('Reason for error: ' + event.errorDescription);
      return;
    }

    var playerSprite = this.playerMap_[event.playerInfo.playerId];
    if (playerSprite) {
      playerSprite.visible = false;
    }
    delete this.playerMap_[event.playerInfo.playerId];

    // Tear down the game if there are no more players. Might want to show a nice
    // UI with a countdown instead of tearing down instantly.
    var connectedPlayers = this.gameManager_.getConnectedPlayers();
    if (connectedPlayers.length == 0) {
      console.log('No more players connected. Tearing down game.');
      cast.receiver.CastReceiverManager.getInstance().stop();
    }
  };

/**
 * Handles incoming messages.
 * @param {cast.receiver.games.Event} event
 * @private
 */
cast.games.starcast.StarcastGame.prototype.onGameMessage_ = function (event) {

  console.log(event);
  console.log(event.requestExtraMessageData);

  if (event.statusCode != cast.receiver.games.StatusCode.SUCCESS) {
    console.log('Error: Event status code: ' + event.statusCode);
    console.log('Reason for error: ' + event.errorDescription);

    return;
  }

  var player =
    this.gameManager_.getPlayer(event.playerInfo.playerId);
  if (!player) {
    throw Error('No player found for player ID ' + event.playerInfo.playerId);
  }

  var rowOrCol = event.requestExtraMessageData[cast.games.starcast.StarcastGame.ROW_OR_COL_FIELD_];
  var numRowOrCol = event.requestExtraMessageData[cast.games.starcast.StarcastGame.NUM_ROW_OR_COL_FIELD_];
  this.onPlayerMessage_(player, rowOrCol, numRowOrCol);

};


/**
 * Handles incoming player messages.
 * @param {!cast.receiver.games.PlayerInfo} player
 * @param {boolean} fire If true, fires a bullet and ignores move parameter.
 *     Otherwise, bullet is not fired, and move parameter will be used.
 * @param {number} move Only used if fire parameter is true.
 * @private
 */
cast.games.starcast.StarcastGame.prototype.onPlayerMessage_ = function (player, rowOrCol, numRowOrCol) {

  player.tint = Math.random() * 0xffffff;
  console.log("onPlayerMessage" + rowOrCol + ", " + numRowOrCol);

  var playerSprite = this.playerMap_[player.playerId];
  if (!playerSprite) {
    throw Error('No player sprite found for player ' + player.playerId);
  }

  this.flipPieces(playerSprite, rowOrCol, numRowOrCol);
};

cast.games.starcast.StarcastGame.prototype.flipPieces = function (playerSprite, rowOrCol, numRowOrCol) {
  if (rowOrCol == "ROW") {
    for (var i = 0; i < this.pieces_.length; i++) {
      flipPieceTween(this.pieces_[numRowOrCol][i]);
    }
  } else if (rowOrCol == "COL") {
    for (i = 0; i < this.pieces_.length; i++) {
      flipPieceTween(this.pieces_[i][numRowOrCol]);
    }
  } else if (rowOrCol == "DIAGONAL") {
    for (i = 0; i < this.pieces_.length; i++) {
      flipPieceTween(this.pieces_[this.pieces_.length - i - 1][i]);
    }
  } else {
    throw Error('Only Row, COL, DIAGONAL are allowed but received ' + rowOrCol);
  }

  // call here once because it is called once in any case
  this.playerEachFlipCount_++;

  this.checkFlipsFromPlayerMessage();
  if (this.checkPuzzleIsSolved()) {
    this.displayCongratMessage();
    this.scoreSystem();
    //Display the actual number of flips from a player on the screen
    this.backgroundSprite_.visible = false;
  }
};


cast.games.starcast.StarcastGame.prototype.scoreSystem = function () {
  if (this.playerEachFlipCount_ == this.suggestedFlipCount_) {
    this.displayCountflipsFromPlayerMessage();
  } else if (this.playerEachFlipCount_ > this.suggestedFlipCount_) {
    this.displayCountflipsFromPlayerMessage();
  }
};

cast.games.starcast.StarcastGame.prototype.checkFlipsFromPlayerMessage = function () {
  var hudText_ = "The Player each flips : " + this.playerEachFlipCount_ + " times\n" +
    "The Player final points from givenPoints : " +
    ( 10 * (this.suggestedFlipCount_ + this.extraFlipsThanNecessary_ - this.playerEachFlipCount_)) + " points\n";
  // heads up display messages
  if (this.hud_ == null) {
    this.hud_ = new PIXI.Text(
      hudText_,
      {fontFamily: "Arial", fontSize: 25, fill: "yellow"}
    );
  } else {
    this.hud_.text = hudText_;
  }
  this.hud_.position.set(this.canvasWidth_ / 4, this.canvasHeight_ / 25);
  this.container_.addChild(this.hud_);
};

cast.games.starcast.StarcastGame.prototype.displayCountflipsFromPlayerMessage = function () {
  var message = new PIXI.Text(
    "The Player each flips : " + this.playerEachFlipCount_ + " times\n" +
    "The Player final points from givenPoints : " + ( 10 * (this.suggestedFlipCount_ - this.playerEachFlipCount_)) + " points\n",
    {fontFamily: "Arial", fontSize: 20, fill: "yellow"}
  );
  message.position.set(this.canvasWidth_ / 4, this.canvasHeight_ / 25);
  this.container_.addChild(message);
};

cast.games.starcast.StarcastGame.prototype.checkPuzzleIsSolved = function () {
  for (var i = 0; i < this.pieces_.length; i++) {
    for (var j = 0; j < this.pieces_.length; j++) {
      if (this.pieces_[i][j].flipped)
        return false;
    }
  }
  return true;
};

/*
 *
 * Display ideally how many times user can flip to solve the puzzle as a hint
 *
 */

cast.games.starcast.StarcastGame.prototype.displayFlipSuggestionMessage = function () {
  var message = new PIXI.Text(
    "If you can find the solution with a less flip, there will be more points\n" +
    "Hint! Try to flip as few as these flips :D :" + this.suggestedFlipCount_,
    {fontFamily: "Arial", fontSize: 25, fill: "yellow"}
  );
  message.position.set(this.canvasWidth_ / 4, this.canvasHeight_ * 85 / 100);
  this.container_.addChild(message);
};

cast.games.starcast.StarcastGame.prototype.displayCongratMessage = function () {
  var message = new PIXI.Text(
    "Congratulation!!",
    {fontFamily: "Arial", fontSize: 100, fill: "white"}
  );
  message.position.set(this.canvasWidth_ / 4, this.canvasHeight_ / 2);
  this.container_.addChild(message);
};

function flipPieceTween(piece) {
  piece.flipped = !piece.flipped;
  if (piece.scale.x == 0) {
    createjs.Tween.get(piece.scale).to({x: 1}, 500);
  } else {
    createjs.Tween.get(piece.scale).to({x: 0}, 500);
  }
}

function flipPiece(piece) {
  piece.flipped = !piece.flipped;
  if (piece.scale.x == 0) {
    piece.scale.x = 1;
  } else {
    piece.scale.x = 0;
  }
};


