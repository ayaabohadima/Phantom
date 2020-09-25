import {
  Injectable,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { sign } from 'jsonwebtoken';
import { user } from '../types/user';
import { Email } from '../shared/send-email.service';
import { LoginDto } from '../auth/dto/login.dto';
import { RegisterDto } from '../auth/dto/register.dto';
import { UpdateDto } from './dto/update-user.dto';
import { UpdateSettingsDto } from './dto/update-user-settings.dto';
import * as Joi from '@hapi/joi';
import * as bcrypt from 'bcrypt';
import { NotificationService } from '../shared/notification.service';
import { ValidationService } from '../shared/validation.service';
import { topic } from '../types/topic';
import { pin } from '../types/pin';
import { board } from '../types/board';
/**
 * @module Users
 */
@Injectable()
export class UserService {
  constructor(
    @InjectModel('User') private readonly userModel: Model<user>,
    @InjectModel('Topic') private readonly topicModel: Model<topic>,
    @InjectModel('Pin') private readonly pinModel: Model<pin>,
    @InjectModel('Board') private readonly boardModel: Model<board>,
    private notification: NotificationService,
    private email: Email,
    private ValidationService: ValidationService,
  ) {}

  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description get user by id
   * @param {string} id - user id wanted to get
   * @returns {object<User>}
   */
  async getUserById(id) {
    const user = await this.userModel.findById(id);
    if (!user)
      throw new HttpException('Unauthorized access', HttpStatus.UNAUTHORIZED);
    if (!user.about) user.about = '';
    return user;
  }

  /**
   * @description Sget user by id  with profile data
   * @param {string} id - user id wanted to get
   * @returns {object<User>}
   */
  async getUserMe(id) {
    let userId = mongoose.Types.ObjectId(id);
    let user = await this.userModel.aggregate([
      { $match: { _id: userId } },
      {
        $project: {
          followers: { $size: '$followers' },
          email: 1,
          gender: 1,
          country: 1,
          firstName: 1,
          lastName: 1,
          location: 1,
          activity: 1,
          pinsForYou: 1,
          pinsInspired: 1,
          popularPins: 1,
          boardsForYou: 1,
          boardUpdate: 1,
          invitation: 1,
          pinsNotification: 1,
          followNotification: 1,
          userName: 1,
          sortType: 1,
          profileImage: 1,
          google: 1,
          googleImage: 1,
        },
      },
    ]);
    if (!user)
      throw new HttpException('Unauthorized access', HttpStatus.UNAUTHORIZED);
    if (!user[0].about) user[0].about = '';
    return user[0];
  }

  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description get notification data from user
   * @param {string} id - user id wanted to get
   * @returns {object}
   */
  async getUserNotifications(userId) {
    let user = await this.userModel.findById(userId, {
      notifications: 1,
      notificationCounter: 1,
    });
    let offset: number =
      user.notifications.length > 30 ? user.notifications.length - 30 : 0;
    let limit: number =
      user.notifications.length > 30 ? offset + 30 : user.notifications.length;
    let ret = {
      notificationCounter: user.notificationCounter,
      notifications: user.notifications.slice(offset, limit),
    };
    return ret;
  }

  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description get user by findData and get only from user data
   * @param {Object} findData - user data wanted to get
   * @param {Object} data - data should get
   * @returns {Object}
   */
  async findUserAndGetData(findData: {}, data: {}) {
    const user = await this.userModel.findOne(findData, data).lean();
    if (!user)
      throw new HttpException('Unauthorized access', HttpStatus.UNAUTHORIZED);
    if (!user.about) user.about = '';
    return user;
  }

  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description get user by login
   * @param {LoginDto} loginDto - email of user & password
   * @returns {object} object of _id :id of user , profileImage : user image & email :user email
   */
  async findByLogin(loginDto: LoginDto) {
    const user = await this.findUserAndGetData(
      { email: loginDto.email },
      { password: 1, profileImage: 1, email: 1, _id: 1 },
    ).catch(err => {
      console.log(err);
    });
    if (!user)
      throw new HttpException('not user by this email', HttpStatus.FORBIDDEN);
    if (await bcrypt.compare(loginDto.password, user.password)) {
      return user;
    }
    throw new HttpException('password is not correct', HttpStatus.FORBIDDEN);
  }

  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description check data after create user
   * @param {RegisterDto} registerDto - data of created user
   */
  async checkCreateData(registerDto: RegisterDto) {
    const shcema = Joi.object({
      email: Joi.string()
        .trim()
        .email()
        .required(),
      password: Joi.string().required(),
      birthday: Joi.date()
        .raw()
        .required(),
      firstName: Joi.string().required(),
      lastName: Joi.string().required(),
      country: Joi.string().optional(),
      gender: Joi.string().optional(),
      bio: Joi.string().optional(),
      iat: Joi.optional(),
      exp: Joi.optional(),
    });
    const body = registerDto;
    const validate = shcema.validate(body);
    if (validate.error)
      throw new HttpException(validate.error, HttpStatus.FORBIDDEN);
    if (await this.checkMAilExistAndFormat(registerDto.email))
      throw new HttpException(
        '"email" should not have acount',
        HttpStatus.FORBIDDEN,
      );
  }

  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description check update data after update
   * @param {UpdateDto} updateDto - data need to update
   */
  async checkUpdateData(updateDto: UpdateDto) {
    const shcema = Joi.object({
      email: Joi.string()
        .trim()
        .email()
        .optional(),
      password: Joi.string().optional(),
      birthDate: Joi.date()
        .raw()
        .optional(),
      firstName: Joi.string().optional(),
      lastName: Joi.string().optional(),
      country: Joi.string().optional(),
      location: Joi.string().optional(),
      userName: Joi.string().optional(),
      gender: Joi.string().optional(),
      bio: Joi.string().optional(),
      iat: Joi.optional(),
      exp: Joi.optional(),
      profileImage: Joi.string().optional(),
    });
    const body = updateDto;
    const validate = shcema.validate(body);
    if (validate.error)
      throw new HttpException(validate.error, HttpStatus.FORBIDDEN);
    if (updateDto.email)
      if (await this.checkMAilExistAndFormat(updateDto.email))
        throw new HttpException(
          '"email" should not have acount',
          HttpStatus.FORBIDDEN,
        );
  }

  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description update FCM token value
   * @param {String} fcmToken - token for notification
   * @param {String} userId   - id of user
   * @returns {Number} 1
   */
  async updateFCMTocken(fcmToken, userId) {
    const user = await this.findUserAndGetData(
      { _id: userId },
      { fcmToken: 1, _id: 1, email: 1 },
    );
    await this.userModel.update({ _id: userId }, { fcmToken: fcmToken });
    if (fcmToken && fcmToken != ' ')
      await this.notification.sendOfflineNotification(
        user.offlineNotifications,
        user.fcmToken,
      );
    return 1;
  }

  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description get user following topics
   * @param {String} userId - id of user
   * @returns {Array<String>} - following topic ids s
   */
  async followingTopics(userId) {
    const user = await this.findUserAndGetData(
      { _id: userId },
      { _id: 1, email: 1, followingTopics: 1 },
    );
    return user.followingTopics;
  }

  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description create new user
   * @param {RegisterDto} registerDto -data to create user
   * @returns {Object} _id ,email and profileImage of userS
   */
  async createUser(registerDto: RegisterDto) {
    let hash,
      googleImage = null,
      picture = null;
    if (registerDto.isGoogle) {
      hash = '';
      googleImage = registerDto.profileImage;
    } else {
      await this.checkCreateData(registerDto);
      const salt = await bcrypt.genSalt(10);
      hash = await bcrypt.hash(registerDto.password, salt);
    }
    var newUser = new this.userModel({
      firstName: registerDto.firstName,
      lastName: registerDto.lastName,
      location: '',
      notificationCounter: 0,
      profileImage: picture,
      lastTopics: [],
      userName: registerDto.firstName + ' ' + registerDto.lastName,
      email: registerDto.email,
      password: hash,
      sortType: 'Date',
      fcmToken: ' ',
      boardsForYou: true,
      popularPins: true,
      pinsForYou: true,
      pinsInspired: true,
      activity: true,
      invitation: true,
      boardUpdate: true,
      history: [],
      facebook: false,
      googleImage: googleImage,
      google: registerDto.isGoogle ? registerDto.isGoogle : false,
      about: registerDto.bio ? registerDto.bio : '',
      gender: registerDto.gender,
      country: registerDto.country,
      birthDate: registerDto.birthday,
      activateaccount: true,
      followNotification: true,
      pinsNotification: true,
      pins: [],
      homeFeed: [],
      uploadedImages: [],
      savedImages: [],
      notifications: [],
      offlineNotifications: [],
      followers: [],
      following: [],
      followingTopics: [],
      boards: [],
      counts: {
        likes: 0,
        comments: 0,
        repins: 0,
        saves: 0,
      },
      createdAt: Date.now(),
    });
    await newUser.save();
    newUser = await this.userModel.findById(newUser._id, {
      firstName: 1,
      lastName: 1,
    });
    let topics = await this.topicModel.find(
      {},
      { name: 1, recommendedUsers: 1 },
    );
    for (let i = 0; i < topics.length; i++) {
      if (
        newUser.firstName.includes(String(topics[i].name)) ||
        newUser.lastName.includes(String(topics[i].name))
      ) {
        if (!topics[i].recommendedUsers) topics[i].recommendedUsers = [];
        if (!topics[i].recommendedUsers.includes(newUser._id)) {
          topics[i].recommendedUsers.push(newUser._id);
          await topics[i].save();
          break;
        }
      }
    }
    await this.userModel.ensureIndexes();
    return newUser;
  }

  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description check email in formate and if exist
   * @param {String} email - email should check
   * @returns  {Object<User>}
   */
  async checkMAilExistAndFormat(email) {
    const body = { email: email };
    const shcema = Joi.object({
      email: Joi.string()
        .trim()
        .email()
        .required(),
    });
    const validate = shcema.validate(body);
    if (validate.error != null)
      throw new HttpException(validate.error, HttpStatus.FORBIDDEN);
    const user = await this.userModel
      .findOne(
        { email: email },
        {
          password: 1,
          _id: 1,
          email: 1,
          fcmToken: 1,
          location: 1,
          firstName: 1,
        },
      )
      .lean();
    return user;
  }

  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description change user password
   * @param {String} userId - user id
   * @param {String} newPassword - new password of user
   * @param {String} oldPassword - old password of user
   * @returns {Number} 1
   */
  async resetPassword(userId, newPassword, oldPassword) {
    const user = await this.findUserAndGetData(
      { _id: userId },
      { email: 1, password: 1, _id: 1, fristName: 1 },
    );
    if (!user || !newPassword)
      throw new HttpException('there is no new password', HttpStatus.FORBIDDEN);
    if (oldPassword) {
      if (!(await bcrypt.compare(oldPassword, user.password))) {
        throw new HttpException(
          'old password is not correct',
          HttpStatus.FORBIDDEN,
        );
      }
    }
    const salt = await bcrypt.genSalt(10);
    let hash = await bcrypt.hash(newPassword, salt);
    user.password = hash;
    await this.userModel.updateOne({ _id: userId }, { password: hash });
    return 1;
  }

  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description update information in user profile
   * @param {String} userId -id of user
   * @param {UpdateDto} updateDto -update data
   * @returns {Number} 1
   */
  async updateUserInfo(userId, updateDto: UpdateDto) {
    const user = await this.getUserMe(userId);
    if (!user) return 0;
    if (updateDto.firstName)
      await this.userModel.updateOne(
        { _id: userId },
        { firstName: updateDto.firstName },
      );
    if (updateDto.lastName)
      await this.userModel.updateOne(
        { _id: userId },
        { lastName: updateDto.lastName },
      );
    if (updateDto.userName)
      await this.userModel.updateOne(
        { _id: userId },
        { userName: updateDto.userName },
      );
    if (updateDto.location)
      await this.userModel.updateOne(
        { _id: userId },
        { location: updateDto.location },
      );
    if (updateDto.bio)
      await this.userModel.updateOne({ _id: userId }, { about: updateDto.bio });
    if (updateDto.gender)
      await this.userModel.updateOne(
        { _id: userId },
        { gender: updateDto.gender },
      );
    if (updateDto.country)
      await this.userModel.updateOne(
        { _id: userId },
        { country: updateDto.country },
      );
    if (updateDto.profileImage) {
      await this.userModel.updateOne(
        { _id: userId },
        { profileImage: updateDto.profileImage },
      );
    }

    if (
      updateDto.email &&
      !(await this.checkMAilExistAndFormat(updateDto.email))
    ) {
      var token =
        'Bearer ' +
        sign(
          {
            email: user.email,
            _id: user._id,
            newEmail: updateDto.email,
            firstName: updateDto.firstName
              ? updateDto.firstName
              : user.firstName,
          },
          process.env.SECRET_KEY,
          { expiresIn: '67472347632732h' },
        );

      await this.email.sendEmail(
        user.email,
        token,
        'change email',
        updateDto.firstName ? updateDto.firstName : user.firstName,
      );
    }
    if (updateDto.birthDate)
      await this.userModel.updateOne(
        { _id: userId },
        { birthDate: updateDto.birthDate },
      );
    return 1;
  }

  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description update settings in user profile
   * @param {String} userId -id of user
   * @param {UpdateSettings} updateSettings - settings data should update
   * @returns {Number} 1
   */
  async updateSettings(userId, settings: UpdateSettingsDto) {
    const user = await this.getUserById(userId);
    if (settings.deleteflag) {
      for (let i = 0; i < user.followers.length; i++) {
        await this.unfollowUser(user.followers[i], user._id);
      }
      for (let i = 0; i < user.following.length; i++) {
        await this.unfollowUser(user._id, user.followers[i]);
      }
      return await this.deleteUser(userId);
    }
    await this.userModel.updateOne({ _id: userId }, settings);
    return 1;
  }

  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description set user email
   * @param {string} userId - id of user
   * @param {string} newEmail  - new email
   * @returns {Number}
   */
  async setEmail(userId, newEmail) {
    const user = await this.findUserAndGetData(
      { _id: userId },
      { email: 1, _id: 1 },
    );
    if (!user || !newEmail) return 0;
    await this.userModel.updateOne({ _id: userId }, { email: newEmail });
    return 1;
  }
  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description delete user
   * @param {string} id -the id of user went to deleted
   */
  async deleteUser(id) {
    const user = await this.getUserById(id);
    // delete following
    //delete followers
    // delete pins saved created
    // delete commints for pin
    //delete react
    //delete chat (in ask)
    // delete following topic
    await this.userModel.findByIdAndDelete(id);
    await this.email.sendEmail(
      user.email,
      null,
      'Delete account',
      user.firstName,
    );
  }

  /**
   * @author Nada AbdElmaboud <nada5aled52@gmail.com>
   * @description set view state of user
   * @param {String} userId - the id of user
   * @param  {String} viewState  - view state 'Default' or 'Compact'
   * @returns {String} view state
   */
  async setViewState(userId, viewState) {
    if ((await this.ValidationService.checkMongooseID([userId])) == 0) {
      throw new BadRequestException('not valid id');
    }
    const user = await this.findUserAndGetData(
      { _id: userId },
      { _id: 1, email: 1, viewState: 1 },
    );
    if (!user) throw new NotFoundException('user not found');
    if (viewState != 'Default' && viewState != 'Compact') {
      throw new BadRequestException(
        "view state must be 'Default' or 'Compact' only",
      );
    }
    user.viewState = viewState;
    await this.userModel.update({ _id: userId }, { viewState: viewState });
    return viewState;
  }

  /**
   * @author Nada AbdElmaboud <nada5aled52@gmail.com>
   * @description get view state of user
   * @param {String} userId - the id of user
   * @returns {String} view state
   */
  async getViewState(userId) {
    if ((await this.ValidationService.checkMongooseID([userId])) == 0) {
      throw new BadRequestException('not valid id');
    }
    const user = await this.findUserAndGetData(
      { _id: userId },
      { _id: 1, viewState: 1 },
    );
    if (!user) throw new NotFoundException('user not found');
    if (!user.viewState) {
      user.viewState = 'Default';
      await this.userModel.update({ _id: userId }, { viewState: 'Default' });
    }
    if (user.viewState) return user.viewState;
    return false;
  }

  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description check if this user follow this user id
   * @param {Object} user - user he follow
   * @param {String} userId - id of user followed
   * @returns {boolean}
   */
  async checkFollowUser(user, userId) {
    if ((await this.ValidationService.checkMongooseID([userId])) === 0)
      throw new HttpException('there is not correct id ', HttpStatus.FORBIDDEN);
    if (!user) throw new BadRequestException('not user');
    if (!user.following)
      await this.userModel.updateOne({ _id: user._id }, { following: [] });
    for (let i = 0; i < user.following.length; i++)
      if (String(userId) === String(user.following[i])) return true;
    return false;
  }

  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description followUser:  make frist user id follow second user id
   * @param {String} followerId - id of user went to follow
   * @param {String} followingId  - id of user wented to be followed
   * @returns {Number}
   */
  async followUser(followerId, followingId) {
    if (
      (await this.ValidationService.checkMongooseID([
        followerId,
        followingId,
      ])) === 0
    )
      throw new HttpException('there is not correct id ', HttpStatus.FORBIDDEN);
    if (String(followerId) == String(followingId))
      throw new HttpException(
        'You can not follow yourself ',
        HttpStatus.FORBIDDEN,
      );
    let userFollow = await this.findUserAndGetData(
      { _id: followerId },
      {
        _id: 1,
        followers: 1,
        following: 1,
        firstName: 1,
        lastName: 1,
        profileImage: 1,
        google: 1,
        googleImage: 1,
      },
    );
    let followedUser = await this.findUserAndGetData(
      { _id: followingId },
      {
        _id: 1,
        followers: 1,
        following: 1,
        firstName: 1,
        lastName: 1,
        notifications: 1,
        notificationCounter: 1,
        offlineNotifications: 1,
        profileImage: 1,
        google: 1,
        googleImage: 1,
      },
    );
    if (!userFollow || !followedUser)
      throw new BadRequestException('one of users not correct');
    if (await this.checkFollowUser(userFollow, followingId))
      throw new BadRequestException('you followed this user before');
    userFollow.following.push(followingId);
    await this.userModel.updateOne(
      { _id: userFollow._id },
      { following: userFollow.following },
    );
    if (!followedUser.followers) followedUser.followers = [];
    followedUser.followers.push(followerId);
    await this.userModel.update(
      { _id: followingId },
      { followers: followedUser.followers },
    );
    if (
      !followedUser.followNotification ||
      followedUser.followNotification == true
    ) {
      var newUserData = await this.notification.followUser(
        followedUser,
        userFollow,
      );
      await this.updateDataInUser(followingId, newUserData);
    }
    return 1;
  }
  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description update data in user model
   * @param {String} userId - user id
   * @param {Object} data  - object of data need to update in user model
   * @returns {Number} 1
   */
  async updateDataInUser(userId, data: {}) {
    if (!(await this.findUserAndGetData({ _id: userId }, { _id: 1, email: 1 })))
      throw new HttpException('Unauthorized access', HttpStatus.UNAUTHORIZED);
    await this.userModel.updateOne({ _id: userId }, data);
    return 1;
  }

  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description unfollowUser:  make frist user id unfollow second user id
   * @param {String} followerId - id of user went to unfollow
   * @param {String} followingId  - id of user wented to be unfollowed
   * @returns {Number}
   */

  async unfollowUser(followerId, followingId) {
    if (
      (await this.ValidationService.checkMongooseID([
        followerId,
        followingId,
      ])) === 0
    )
      throw new HttpException('there is not correct id ', HttpStatus.FORBIDDEN);
    let userFollow = await this.findUserAndGetData(
      { _id: followerId },
      {
        _id: 1,
        followers: 1,
        following: 1,
        firstName: 1,
        lastName: 1,
        profileImage: 1,
        google: 1,
        googleImage: 1,
      },
    );
    let followedUser = await this.findUserAndGetData(
      { _id: followingId },
      {
        _id: 1,
        followers: 1,
        following: 1,
        notifications: 1,
        firstName: 1,
        lastName: 1,
        notificationCounter: 1,
        offlineNotifications: 1,
        profileImage: 1,
        google: 1,
        googleImage: 1,
      },
    );
    if (!userFollow || !followedUser)
      throw new BadRequestException('one of users not correct');
    if (!(await this.checkFollowUser(userFollow, followingId)))
      throw new BadRequestException('you did not follow this user before');
    if (userFollow.following) {
      for (let i = 0; i < userFollow.following.length; i++) {
        if (String(userFollow.following[i]) === String(followingId)) {
          userFollow.following.splice(i, 1);
          await this.userModel.updateOne(
            { _id: userFollow._id },
            { following: userFollow.following },
          );
          break;
        }
      }
    } else throw new BadRequestException('you did not follow this user before');
    if (followedUser.followers) {
      for (let i = 0; i < followedUser.followers.length; i++) {
        if (String(followedUser.followers[i]) === String(followerId)) {
          followedUser.followers.splice(i, 1);
          await this.userModel.updateOne(
            { _id: followedUser._id },
            { followers: followedUser.followers },
          );
          var newUserData = await this.notification.unfollowUser(
            followedUser,
            userFollow,
          );
          await this.updateDataInUser(followingId, newUserData);
          return 1;
        }
      }
    }
    throw new BadRequestException('you did not follow this user before');
  }
  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description userFollowers: get user followers
   * @param {string} userId - user id
   * @param {Number} limit  - the limit
   * @param {Number} offset - the start
   * @returns {object} - has array of user object and real number of followers
   */

  async userFollowers(userId, limit, offset) {
    if ((await this.ValidationService.checkMongooseID([userId])) === 0)
      throw new HttpException('there is not correct id ', HttpStatus.FORBIDDEN);
    const user = await this.findUserAndGetData(
      { _id: userId },
      { following: 1, _id: 1, followers: 1 },
    );
    if (!user) throw new HttpException('not user ', HttpStatus.FORBIDDEN);
    if (!user.followers || user.followers.length == 0)
      return { followers: [], numOfFollowers: 0 };
    const followers = this.ValidationService.limitOffset(
      limit,
      offset,
      user.followers,
    );
    var followersInfo = [];
    for (let i = 0; i < followers.length; i++) {
      var currentUser = await this.findUserAndGetData(
        { _id: followers[i] },
        {
          _id: 1,
          firstName: 1,
          lastName: 1,
          profileImage: 1,
          google: 1,
          googleImage: 1,
        },
      );
      if (currentUser) followersInfo.push(currentUser);
    }
    return { followers: followersInfo, numOfFollowers: user.followers.length };
  }

  /**
   * @author Aya Abohadima <ayasabohadima@gmail.com>
   * @description userFollowings: get user following
   * @param {string} userId - user id
   * @param {Number} limit  - the limit
   * @param {Number} offset - the start
   * @returns {object} - has array of user object and real number of followings
   */
  async userFollowings(userId, limit, offset) {
    if ((await this.ValidationService.checkMongooseID([userId])) === 0)
      throw new HttpException('there is not correct id ', HttpStatus.FORBIDDEN);
    const user = await this.findUserAndGetData(
      { _id: userId },
      { following: 1, _id: 1, followers: 1 },
    );
    if (!user) throw new HttpException('not user ', HttpStatus.FORBIDDEN);
    if (!user.following || user.following.length == 0)
      return { followings: [], numOfFollowings: 0 };
    const followings = this.ValidationService.limitOffset(
      limit,
      offset,
      user.following,
    );
    let followingsInfo = [];
    for (let i = 0; i < followings.length; i++) {
      var currentUser = await this.findUserAndGetData(
        { _id: followings[i] },
        {
          _id: 1,
          firstName: 1,
          lastName: 1,
          profileImage: 1,
          google: 1,
          googleImage: 1,
        },
      );
      if (currentUser) followingsInfo.push(currentUser);
    }
    return {
      followings: followingsInfo,
      numOfFollowings: user.following.length,
    };
  }
}